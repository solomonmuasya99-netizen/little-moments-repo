const express = require('express');
const { nanoid } = require('nanoid');
const db = require('../db');
const paystack = require('../paystack');

const router = express.Router();

const CURRENCY = process.env.PAYSTACK_CURRENCY || 'KES';
// Price is anchored to a real USD amount, then converted to the charge
// currency using a rate you control — NOT an arbitrary local-currency number,
// so "$2" always actually means $2, not whatever KES/GHS/etc figure was typed in.
const USD_CENTS = parseInt(process.env.NOTE_PRICE_USD_CENTS || '200', 10); // 200 = $2.00
const USD_TO_LOCAL_RATE = parseFloat(process.env.USD_TO_LOCAL_RATE || '130'); // update as rates move
const PRICE = Math.round((USD_CENTS / 100) * USD_TO_LOCAL_RATE * 100); // in the charge currency's minor units
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// GET /api/price
// The single source of truth for what a note actually costs, in both USD and
// the charge currency. The frontend fetches this instead of hardcoding "$2.00"
// so the displayed price can never drift out of sync with what's really charged.
// ---------------------------------------------------------------------------
router.get('/price', (req, res) => {
  res.json({
    usd: (USD_CENTS / 100).toFixed(2),
    currency: CURRENCY,
    amountMinorUnits: PRICE,
    localDisplay: `${CURRENCY} ${(PRICE / 100).toFixed(2)}`,
  });
});

// ---------------------------------------------------------------------------
// POST /api/notes
// Creates a draft note + starts a Paystack payment. The note is NOT visible
// to anyone (including the sender) until the payment actually succeeds.
// ---------------------------------------------------------------------------
router.post('/notes', async (req, res) => {
  try {
    const { email, ...noteData } = req.body || {};

    if (!noteData.recipient || !noteData.message || !noteData.type) {
      return res.status(400).json({ error: 'Missing required note fields (type, recipient, message).' });
    }
    if (!email) {
      // Paystack requires an email for the transaction. This is the SENDER's
      // email, purely for the payment receipt — not shown to the recipient.
      return res.status(400).json({ error: 'An email is required to process payment.' });
    }

    const id = nanoid(8);
    const reference = `lm_${id}_${Date.now()}`;

    db.createNote({ id, reference, payload: noteData });

    const tx = await paystack.initializeTransaction({
      email,
      amountMinorUnits: PRICE,
      currency: CURRENCY,
      reference,
      // Explicitly request card as a channel. Whether Mastercard / non-African
      // cards actually go through depends on your Paystack account's enabled
      // channels and international-card settings — that's a dashboard/KYC
      // setting on Paystack's side, not something this code controls. Check
      // Settings → Preferences (or ask Paystack support) if cards are declining.
      channels: ['card'],
      // IMPORTANT: this points at OUR backend, not the frontend directly.
      // Paystack will redirect the browser here first so we can verify the
      // payment server-side before anyone sees a "success" screen — a raw
      // client-side redirect can be faked, server verification can't.
      callbackUrl: `${BACKEND_URL}/api/paystack/callback`,
      metadata: { noteId: id },
    });

    res.json({
      noteId: id,
      reference,
      authorizationUrl: tx.authorization_url,
    });
  } catch (err) {
    console.error('POST /api/notes failed:', err.message);
    res.status(500).json({ error: 'Could not start payment. Please try again.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/paystack/callback?reference=...
// Paystack redirects the browser here after checkout. We verify server-side
// (never trust the redirect alone — a reference in a URL can be faked) and
// then bounce the user to the frontend success page.
// ---------------------------------------------------------------------------
router.get('/paystack/callback', async (req, res) => {
  const { reference } = req.query;
  if (!reference) return res.redirect(`${FRONTEND_URL}/?payment=missing_reference`);

  try {
    const tx = await paystack.verifyTransaction(reference);
    if (tx.status === 'success') {
      const changed = db.markPaidByReference(reference);
      const note = db.getNoteByReference(reference);
      if (changed || (note && note.status === 'paid')) {
        // Single-page frontend: no separate success.html — the app itself
        // reads ?noteId=&paid=1 on load and jumps straight to the success screen.
        return res.redirect(`${FRONTEND_URL}/?noteId=${note.id}&paid=1`);
      }
    }
    res.redirect(`${FRONTEND_URL}/?payment=failed`);
  } catch (err) {
    console.error('Paystack callback verify failed:', err.message);
    res.redirect(`${FRONTEND_URL}/?payment=error`);
  }
});

// ---------------------------------------------------------------------------
// POST /api/paystack/webhook
// The reliable path — Paystack calls this directly from their servers
// regardless of whether the customer's browser redirect ever completes.
// Set this URL in Paystack Dashboard -> Settings -> API Keys & Webhooks.
// ---------------------------------------------------------------------------
router.post('/paystack/webhook', (req, res) => {
  const signature = req.headers['x-paystack-signature'];

  if (!paystack.isValidWebhookSignature(req.rawBody, signature)) {
    console.warn('Rejected webhook with invalid signature');
    return res.status(401).end();
  }

  // Acknowledge immediately — Paystack retries if you're slow to respond.
  res.status(200).end();

  const event = req.body;
  if (event && event.event === 'charge.success') {
    const reference = event.data.reference;
    db.markPaidByReference(reference);
  }
});

// ---------------------------------------------------------------------------
// GET /api/notes/:id
// Used by the reveal page. Only returns data once the note is actually paid.
// ---------------------------------------------------------------------------
router.get('/notes/:id', (req, res) => {
  const note = db.getPaidNoteById(req.params.id);
  if (!note) return res.status(404).json({ error: 'Note not found (or not paid for yet).' });
  res.json({ id: note.id, ...note.payload });
});

// ---------------------------------------------------------------------------
// POST /api/notes/:id/reaction
// Recorded when the recipient taps a reaction on the reveal page.
// ---------------------------------------------------------------------------
router.post('/notes/:id/reaction', (req, res) => {
  const { reaction } = req.body || {};
  if (!reaction) return res.status(400).json({ error: 'Missing reaction.' });
  const ok = db.setReaction(req.params.id, reaction);
  if (!ok) return res.status(404).json({ error: 'Note not found (or not paid for yet).' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /api/notes/:id/status
// Lets the sender's success page poll to see if/how the note was reacted to.
// ---------------------------------------------------------------------------
router.get('/notes/:id/status', (req, res) => {
  const row = db.getReactionStatus(req.params.id);
  if (!row) return res.status(404).json({ error: 'Note not found.' });
  res.json(row);
});

module.exports = router;
