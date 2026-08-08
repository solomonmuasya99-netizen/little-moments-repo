# Little Moments

A magical digital-note app — animated reveals, sound, photos, a big-emoji
finale, a birthday candle you blow out with your mic, and a real Paystack
paywall behind it.

## Repo layout

```
/index.html      ← the whole frontend (landing, builder, reveal) — one file
/backend/        ← the Express + Paystack + SQLite API
```

This is set up as one repo so GitHub Pages can serve `/index.html` directly
from the root, while Render deploys only the `/backend` folder as its own
service. They're independent — the frontend just needs to know the backend's
URL (see step 3 below).

## 1. Push this to GitHub

Create a new repo on GitHub, then push everything in this folder to it
(GitHub's web UI lets you drag-and-drop all these files/folders in if you'd
rather not use git commands).

## 2. Turn on GitHub Pages (hosts the frontend)

In your repo: **Settings → Pages → Source → Deploy from a branch → main → / (root)**.

GitHub will give you a URL like:
```
https://yourusername.github.io/little-moments/
```
That's your real, public frontend — open that on your phone right now and
you'll see the landing page (payment won't work yet until step 3).

## 3. Deploy the backend on Render

1. On [render.com](https://render.com), **New → Web Service**, connect this
   same GitHub repo.
2. Set **Root Directory** to `backend` (important — this tells Render to only
   build/run what's in that subfolder, not the whole repo).
3. Build command: `npm install` — Start command: `npm start`
4. Add environment variables (see `backend/.env.example` for the full list
   and explanations):
   - `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` — from your Paystack dashboard
   - `PAYSTACK_CURRENCY`, `NOTE_PRICE_MINOR_UNITS`
   - `FRONTEND_URL` — your GitHub Pages URL from step 2
   - `BACKEND_URL` — leave a placeholder for now; Render won't tell you the
     real URL until after the first deploy. Once you see it (something like
     `https://little-moments-backend.onrender.com`), come back and set
     `BACKEND_URL` to that, then redeploy.

## 4. Point the frontend at the backend

Open `index.html`, find this line near the top of the `<script>` block:
```js
const CONFIG = { API_BASE: window.LITTLE_MOMENTS_API || 'http://localhost:3000' };
```
Change `http://localhost:3000` to your real Render URL from step 3, commit,
and push. GitHub Pages will rebuild automatically in a minute or two.

## 5. Set the Paystack webhook

In Paystack dashboard → **Settings → API Keys & Webhooks**, set the webhook
URL to:
```
https://your-render-url.onrender.com/api/paystack/webhook
```

## 6. Test it for real

Open your GitHub Pages URL on your phone, make a note, pay with a
[Paystack test card](https://paystack.com/docs/payments/test-payments/), and
you should land back on a real success screen with a real, shareable link —
one that works on any device, because it's now actually live on the internet.

Full API details and troubleshooting: see `backend/README.md`.
