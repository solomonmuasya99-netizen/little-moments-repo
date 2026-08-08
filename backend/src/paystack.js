// Thin wrapper around Paystack's REST API. Docs: https://paystack.com/docs/api/
const crypto = require('crypto');

const PAYSTACK_BASE = 'https://api.paystack.co';

function secretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not set — check your .env file');
  return key;
}

// Starts a payment. Returns { authorization_url, access_code, reference }.
// amountMinorUnits: price in the currency's smallest unit (e.g. cents/kobo) — never send fractional units.
async function initializeTransaction({ email, amountMinorUnits, currency, reference, callbackUrl, metadata }) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: amountMinorUnits,
      currency,
      reference,
      callback_url: callbackUrl,
      metadata,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.status) {
    throw new Error(data.message || 'Paystack initialize failed');
  }
  return data.data; // { authorization_url, access_code, reference }
}

// Confirms a transaction actually succeeded server-side. Always do this —
// never trust the frontend redirect alone, since it can be spoofed.
async function verifyTransaction(reference) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });
  const data = await res.json();
  if (!res.ok || !data.status) {
    throw new Error(data.message || 'Paystack verify failed');
  }
  return data.data; // includes .status ('success' | 'failed' | ...), .amount, .currency, .metadata
}

// Paystack signs webhook bodies with HMAC-SHA512 using your secret key.
// This confirms a webhook actually came from Paystack and wasn't forged.
function isValidWebhookSignature(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  const hash = crypto.createHmac('sha512', secretKey()).update(rawBody).digest('hex');
  return hash === signatureHeader;
}

module.exports = { initializeTransaction, verifyTransaction, isValidWebhookSignature };
