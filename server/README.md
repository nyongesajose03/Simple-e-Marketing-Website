# Daraja sandbox setup

This server is a **sandbox-only test integration**. It cannot charge customers, collect a real M-Pesa PIN, or confirm a live payment. Do not use it to fulfil orders. The customer should only ever enter an M-Pesa PIN in the Safaricom prompt on their phone.

## Requirements

- Node.js 20 or newer
- A Daraja developer application with sandbox credentials
- A public HTTPS URL for the callback. A local `localhost` URL is not reachable by Safaricom; use a trusted HTTPS tunnel or deploy the sandbox server.

## Configure

1. Copy `server/.env.example` to `server/.env`. In PowerShell, from the project root, run `Copy-Item server\.env.example server\.env`.
2. Fill in the sandbox consumer key, consumer secret, shortcode, and passkey from the Daraja developer portal. Do not put these values in frontend files or commit/share them.
3. Set `PUBLIC_BASE_URL` to the public HTTPS origin that forwards to this server, without a trailing path. The callback route is appended by the server.
4. If your Live Server address differs from the defaults, update `ALLOWED_ORIGINS` to the exact browser origin.
5. In a terminal, start the backend from the project root with `cd server` followed by `npm start`. Leave this terminal running while you use the website. It should print `SEJO'S Daraja sandbox API listening at http://127.0.0.1:3000`.
6. Open `http://127.0.0.1:3000/api/health` in a browser. It should return `{"status":"ok","environment":"sandbox"}`.
7. Open the website with VS Code Live Server (normally `http://127.0.0.1:5500` or `http://localhost:5500`), not as a `file:///...` page. The browser sends checkout requests to `http://127.0.0.1:3000`.

If checkout says it cannot reach the payment server, confirm the `npm start` terminal is still running and the health URL responds. If health works but checkout reports that sandbox configuration is missing, check the Daraja values and `PUBLIC_BASE_URL` in `server/.env`. If the browser console reports a CORS error, add the exact Live Server origin (including its port) to `ALLOWED_ORIGINS`, then restart the backend.

The server recalculates the order from its own KES product catalogue; it does not trust prices sent by the browser. Payment status is held in memory for up to 30 minutes, so this is not production order storage. A matching sandbox callback is required before the page shows a completed test status.

## Before production

Do not switch the sandbox URL or credentials to production in this sample. A live deployment needs an approved Daraja production app and registered shortcode/passkey, a secured and monitored HTTPS host, persistent order storage, callback validation/reconciliation with Safaricom, rate limiting, operational logging, and end-to-end testing. Live payments must not be marked fulfilled solely because a browser says they succeeded.
