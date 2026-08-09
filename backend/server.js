require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const notesRouter = require('./src/routes/notes');

const app = express();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

// Allow the configured frontend origin, plus requests with no origin at all
// (this covers opening the HTML file directly from disk while testing locally,
// e.g. by double-clicking it or serving it from VS Code's Live Server).
app.use(cors({
  origin: (origin, callback) => {
    // Browsers send Origin as scheme+host only (no path), but FRONTEND_URL may
    // include a path (e.g. GitHub Pages project sites: https://you.github.io/repo).
    // So we check that FRONTEND_URL starts with the request's origin, not an exact match.
    if (!origin || FRONTEND_URL.startsWith(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
}));

// Capture the raw request body (needed to verify Paystack's webhook signature)
// while still parsing it as JSON for normal use in req.body.
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; },
}));

app.use('/api', notesRouter);

// Optional: serve the built frontend from /public if you copy it in here.
// Otherwise, host the frontend separately (e.g. GitHub Pages) and just point
// FRONTEND_URL at it — the API works fine either way.
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Little Moments backend listening on port ${PORT}`);
});
