"use strict";

const http = require("node:http");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

function loadEnvFile() {
    try {
        const content = readFileSync(resolve(__dirname, "..", ".env"), "utf8");
        for (const line of content.split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
            if (!match || Object.hasOwn(process.env, match[1])) {
                continue;
            }
            process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
        }
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }
}

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://127.0.0.1:5500,http://localhost:5500")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const CATALOG = Object.freeze({
    headphones: { name: "Wireless Headphones", priceKes: 4900 },
    backpack: { name: "Everyday Backpack", priceKes: 3600 },
    mug: { name: "Stoneware Coffee Mug", priceKes: 1400 },
    watch: { name: "Everyday Smartwatch", priceKes: 5900 }
});

const FREE_DELIVERY_THRESHOLD_KES = 7500;
const STANDARD_DELIVERY_KES = 500;
const EXPRESS_DELIVERY_KES = 1200;
const payments = new Map();
let cachedAccessToken;
let tokenExpiresAt = 0;

function sendJson(response, statusCode, data) {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
    });
    response.end(JSON.stringify(data));
}

function setCorsHeaders(request, response) {
    const origin = request.headers.origin;
    if (!origin) {
        return true;
    }
    if (!ALLOWED_ORIGINS.includes(origin)) {
        return false;
    }
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return true;
}

function readJson(request) {
    return new Promise((resolveBody, rejectBody) => {
        let body = "";
        request.on("data", (chunk) => {
            body += chunk;
            if (body.length > 16_384) {
                rejectBody(new Error("Request body is too large."));
                request.destroy();
            }
        });
        request.on("end", () => {
            try {
                resolveBody(JSON.parse(body));
            } catch {
                rejectBody(new Error("Request body must be valid JSON."));
            }
        });
        request.on("error", rejectBody);
    });
}

function normalizePhone(phone) {
    const cleaned = String(phone || "").replace(/[\s()+-]/g, "");
    const international = cleaned.startsWith("0")
        ? `254${cleaned.slice(1)}`
        : cleaned;
    if (!/^254(?:7|1)\d{8}$/.test(international)) {
        throw new Error("Enter a valid Kenyan mobile number, such as 0712 345 678.");
    }
    return international;
}

function getOrderAmount(body) {
    if (!body || typeof body !== "object" ||
        !Array.isArray(body.items) || body.items.length === 0 || body.items.length > 20) {
        throw new Error("Your cart is empty or contains too many different products.");
    }

    const seenProducts = new Set();
    let subtotal = 0;
    for (const item of body.items) {
        if (!item || !Object.hasOwn(CATALOG, item.id) ||
            !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 ||
            seenProducts.has(item.id)) {
            throw new Error("Your cart contains an invalid product or quantity. Please refresh and try again.");
        }
        seenProducts.add(item.id);
        subtotal += CATALOG[item.id].priceKes * item.quantity;
    }

    const shipping = body.shipping === "express"
        ? EXPRESS_DELIVERY_KES
        : body.shipping === "standard"
            ? subtotal >= FREE_DELIVERY_THRESHOLD_KES ? 0 : STANDARD_DELIVERY_KES
            : null;
    if (shipping === null) {
        throw new Error("Choose a valid delivery method.");
    }
    const amount = subtotal + shipping;
    if (!Number.isSafeInteger(amount) || amount < 1) {
        throw new Error("The order total is invalid.");
    }
    return amount;
}

function getDarajaConfig() {
    if (process.env.DARAJA_ENV !== "sandbox") {
        throw new Error("This server is restricted to Daraja sandbox mode.");
    }
    const { DARAJA_CONSUMER_KEY, DARAJA_CONSUMER_SECRET, DARAJA_SHORTCODE, DARAJA_PASSKEY, PUBLIC_BASE_URL } = process.env;
    if (!DARAJA_CONSUMER_KEY || !DARAJA_CONSUMER_SECRET ||
        !DARAJA_SHORTCODE || !DARAJA_PASSKEY || !PUBLIC_BASE_URL) {
        throw new Error("Configure the Daraja sandbox credentials and public HTTPS callback URL in the server .env file.");
    }

    const publicUrl = new URL(PUBLIC_BASE_URL);
    if (publicUrl.protocol !== "https:" || publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash) {
        throw new Error("PUBLIC_BASE_URL must be the public HTTPS origin for this server, with no path or query string.");
    }
    return { DARAJA_CONSUMER_KEY, DARAJA_CONSUMER_SECRET, DARAJA_SHORTCODE, DARAJA_PASSKEY, PUBLIC_BASE_URL };
}

function darajaTimestamp() {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Nairobi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

async function getAccessToken(config) {
    if (cachedAccessToken && Date.now() < tokenExpiresAt) {
        return cachedAccessToken;
    }

    const credentials = Buffer.from(`${config.DARAJA_CONSUMER_KEY}:${config.DARAJA_CONSUMER_SECRET}`).toString("base64");
    const response = await fetch("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
        headers: { Authorization: `Basic ${credentials}` },
        signal: AbortSignal.timeout(15_000)
    });
    const result = await response.json();
    if (!response.ok || !result.access_token) {
        throw new Error("Safaricom sandbox authentication failed. Check the Daraja app credentials.");
    }

    cachedAccessToken = result.access_token;
    tokenExpiresAt = Date.now() + Math.max(0, Number(result.expires_in || 3600) - 60) * 1000;
    return cachedAccessToken;
}

function getCallbackMetadata(callback) {
    const items = callback?.Body?.stkCallback?.CallbackMetadata?.Item;
    return Array.isArray(items) ? Object.fromEntries(items.map((item) => [item.Name, item.Value])) : {};
}

async function startStkPush(body) {
    const config = getDarajaConfig();
    const phone = normalizePhone(body.phone);
    const amount = getOrderAmount(body);
    const timestamp = darajaTimestamp();
    const accessToken = await getAccessToken(config);
    const password = Buffer.from(`${config.DARAJA_SHORTCODE}${config.DARAJA_PASSKEY}${timestamp}`).toString("base64");
    const accountReference = `SEJO${Date.now().toString().slice(-8)}`;
    const callbackUrl = `${config.PUBLIC_BASE_URL}/api/payments/mpesa/callback`;

    const response = await fetch("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            BusinessShortCode: config.DARAJA_SHORTCODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: phone,
            PartyB: config.DARAJA_SHORTCODE,
            PhoneNumber: phone,
            CallBackURL: callbackUrl,
            AccountReference: accountReference,
            TransactionDesc: "SEJO STORE ORDER"
        }),
        signal: AbortSignal.timeout(20_000)
    });
    const result = await response.json();
    if (!response.ok || result.ResponseCode !== "0" || !result.CheckoutRequestID) {
        throw new Error(result.errorMessage || result.ResponseDescription || "Safaricom sandbox did not accept the STK Push request.");
    }

    payments.set(result.CheckoutRequestID, {
        amountKes: amount,
        phone,
        status: "pending",
        message: "Sandbox request accepted. Waiting for the Daraja callback.",
        createdAt: Date.now()
    });
    return {
        checkoutRequestId: result.CheckoutRequestID,
        message: result.CustomerMessage || "Sandbox STK Push request accepted."
    };
}

async function handleCallback(request, response) {
    let callback;
    try {
        callback = await readJson(request);
    } catch {
        sendJson(response, 400, { ResultCode: 1, ResultDesc: "Invalid callback body." });
        return;
    }

    const stkCallback = callback?.Body?.stkCallback;
    const payment = payments.get(stkCallback?.CheckoutRequestID);
    if (payment && Number.isInteger(stkCallback.ResultCode)) {
        if (stkCallback.ResultCode === 0) {
            const metadata = getCallbackMetadata(callback);
            const callbackAmount = Number(metadata.Amount);
            const callbackPhone = metadata.PhoneNumber === undefined
                ? ""
                : String(metadata.PhoneNumber);
            if (callbackAmount === payment.amountKes && callbackPhone === payment.phone) {
                payment.status = "paid";
                payment.message = "Sandbox callback confirms the amount and phone number.";
            } else {
                payment.status = "review";
                payment.message = "Sandbox callback details did not match the order. Do not treat this order as paid.";
            }
            payment.receipt = metadata.MpesaReceiptNumber || null;
        } else {
            payment.status = "failed";
            payment.message = stkCallback.ResultDesc || "The sandbox payment was not completed.";
        }
    }

    sendJson(response, 200, { ResultCode: 0, ResultDesc: "Accepted" });
}

async function handleRequest(request, response) {
    if (!setCorsHeaders(request, response)) {
        sendJson(response, 403, { error: "This website origin is not allowed to use the payment API." });
        return;
    }
    if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
    }

    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { status: "ok", environment: "sandbox" });
        return;
    }
    if (request.method === "POST" && url.pathname === "/api/payments/mpesa/stkpush") {
        try {
            const body = await readJson(request);
            const result = await startStkPush(body);
            sendJson(response, 200, result);
        } catch (error) {
            sendJson(response, 400, { error: error.message || "Unable to start the sandbox payment." });
        }
        return;
    }
    if (request.method === "POST" && url.pathname === "/api/payments/mpesa/callback") {
        await handleCallback(request, response);
        return;
    }

    const statusMatch = url.pathname.match(/^\/api\/payments\/mpesa\/([^/]+)$/);
    if (request.method === "GET" && statusMatch) {
        const checkoutRequestId = decodeURIComponent(statusMatch[1]);
        const payment = payments.get(checkoutRequestId);
        if (!payment || Date.now() - payment.createdAt > 30 * 60 * 1000) {
            payments.delete(checkoutRequestId);
            sendJson(response, 404, { error: "Sandbox payment not found or expired." });
            return;
        }
        sendJson(response, 200, { status: payment.status, message: payment.message });
        return;
    }

    sendJson(response, 404, { error: "Not found." });
}

const HOST = process.env.HOST || "0.0.0.0";
const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
        console.error("Payment API request failed:", error.message);
        if (!response.headersSent) {
            sendJson(response, 500, { error: "The payment service encountered an unexpected error." });
        } else {
            response.destroy();
        }
    });
});

server.listen(PORT, HOST, () => {
    console.log(`SEJO'S Daraja sandbox API listening at http://127.0.0.1:${PORT}`);
    console.log("Sandbox mode only. No live payments are enabled.");
});
