# Little Moments — backend

Real payment + storage backend for Little Moments, using Paystack and a small
SQLite database. This replaces the mocked "$2 payment" and fake share link in
the frontend prototype with the real thing.

## What this does

- `POST /api/notes` — saves a draft note and starts a Paystack payment
- `GET /api/paystack/callback` — where Paystack sends the browser back after checkout (verifies payment)
- `POST /api/paystack/webhook` — where Paystack notifies your server directly (the reliable path)
- `GET /api/notes/:id` — fetches a note's content, only once it's paid for
- `POST /api/notes/:id/reaction` — records the recipient's reaction
- `GET /api/notes/:id/status` — lets the sender check if/how it was reacted to

A note is invisible (404) until its payment is confirmed. Nobody can view or
guess their way into an unpaid draft.

## 1. Local setup

```bash
npm install
cp .env.example .env
```

Open `.env` and fill in:
- `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` — from your Paystack dashboard
  under **Settings → API Keys & Webhooks**. Use the `sk_test_...` /
  `pk_test_...` keys while you're building; switch to live keys only when
  you're ready to take real payments.
- `PAYSTACK_CURRENCY` — Paystack charges in specific currencies per account
  (NGN, GHS, ZAR, KES are common). Check your dashboard for what's enabled.
- `NOTE_PRICE_MINOR_UNITS` — the price, in the currency's smallest unit
  (e.g. cents). This is **not** dollars/shillings directly — e.g. 200 KES is
  `20000`.
- `FRONTEND_URL` — wherever the Little Moments frontend is hosted.

Run it:
```bash
npm start
```

Check it's alive: open `http://localhost:3000/health` — you should see `{"ok":true}`.

## 2. Tell Paystack about your webhook

In the Paystack dashboard → **Settings → API Keys & Webhooks**, set the
webhook URL to:
```
https://your-deployed-backend.com/api/paystack/webhook
```
This is what actually marks a note as paid — the browser redirect
(`/api/paystack/callback`) is a nice UX shortcut, but the webhook is what you
can actually trust, since it comes from Paystack's servers directly rather
than through the customer's browser.

Use Paystack's **test cards** (listed in their docs) to run a full payment
through in test mode before going live.

## 3. Deploy (Render, free tier)

1. Push this folder to a GitHub repo.
2. On [render.com](https://render.com), create a new **Web Service** from
   that repo.
3. Build command: `npm install` — Start command: `npm start`
4. Add the same environment variables from your `.env` in Render's
   dashboard (**never commit your real `.env` file**).
5. Once deployed, update `FRONTEND_URL` to match wherever your frontend
   actually lives, and update the Paystack webhook URL to your new Render
   URL.

**Important caveat about the database:** Render's free tier uses an
*ephemeral* filesystem — the SQLite file gets wiped on every redeploy or
restart. That's fine while testing, but before this holds real paid notes
you'll want either Render's persistent disk add-on, or to swap SQLite for a
free hosted Postgres (Render/Neon/Supabase all offer one). Everything else in
the app only talks to the handful of functions in `src/db.js`, so that swap
stays contained to one file.

## 4. Wiring it to the frontend

Good news: the frontend (`little-moments.html`) is already wired to call this
API — no separate success/reveal pages needed. It's all one file that reads
the URL to figure out what to show:

- Normal visit → the usual landing/builder flow. The "Pay" button calls
  `POST /api/notes`, then sends the browser to the real Paystack checkout.
- `?noteId=XXX&paid=1` → Paystack/your backend bounces the browser back here
  after a real, verified payment. The page re-fetches the note and shows the
  success screen with a real share link.
- `?id=XXX` → this is the actual link you send to someone. The page fetches
  that note and plays the reveal. This is the URL to share, not the base URL.

Before running anything, open `little-moments.html` and check the `CONFIG`
line near the top of the `<script>` block — it defaults to
`http://localhost:3000` for local testing. When you deploy the backend, either
edit that line to your real Render URL, or add a small script tag above it:
```html
<script>window.LITTLE_MOMENTS_API = 'https://your-backend.onrender.com';</script>
<script> ... little-moments.html's existing script tag ... </script>
```

### End-to-end local test checklist

1. `npm install` then `npm start` in this backend folder (leave it running).
2. Confirm `http://localhost:3000/health` returns `{"ok":true}`.
3. Open `little-moments.html` directly in your browser (double-click it, or
   use VS Code's Live Server) — CORS is already configured to allow this.
4. Go through the builder, get to Review, enter a real email, hit Pay.
5. You should land on Paystack's actual checkout page. Use one of
   [Paystack's test card numbers](https://paystack.com/docs/payments/test-payments/)
   — this simulates a real payment with no money moving.
6. After "paying," you should be bounced back to `little-moments.html` with
   `?noteId=...&paid=1` in the address bar, landing on the success screen with
   a real link (something like `little-moments.html?id=abc123`).
7. Copy that link, open it in a different browser tab (or send it to your
   phone) — it should fetch the note from the backend and play the full
   reveal, exactly as a real recipient would see it.
8. Tap a reaction — check your terminal running the server; you shouldn't
   see any errors. You can confirm it was saved by hitting
   `http://localhost:3000/api/notes/abc123/status` in a browser (replace
   `abc123` with your real note id) — you should see the reaction come back.

If something breaks at any step, the browser's dev console (F12 → Console)
and the terminal running `npm start` are where the actual error will show up
— paste either one back and it's usually a five-second fix.

## 5. What's NOT done yet

- **QR codes** on the success screen are still a placeholder — real QR
  generation is a fast follow, not done yet.
- **Photos are stored as base64 inside the note's JSON payload** in SQLite —
  fine for a handful of small images, but worth moving to real file storage
  (S3-compatible, Cloudinary, etc.) before this sees heavy real-world use.
- **No email confirmation** to the sender or recipient — everything happens
  in-browser only right now.
- Deploy the database caveat from section 3 (ephemeral disk on Render's free
  tier) still applies — fine for testing, not for real paid notes yet.
