// CollegeOS backend: serves the app and handles email one-time-code sign-in.
//   POST /api/otp/request  { email }        -> emails a 6-digit code
//   POST /api/otp/verify   { email, code }  -> returns a signed session token
//   GET  /api/health                         -> { ok, mail: "gmail" | "dev" }
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOtpStore, classifyEmail, normaliseEmail, signToken, OtpError, OTP_TTL_MS, RESEND_MS } from "./otp.js";
import { createMailer } from "./mailer.js";

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(here, ".env"));

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.OTP_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.OTP_SECRET) console.warn("OTP_SECRET not set: using a random one (sessions reset on restart).");

const otp = createOtpStore(SECRET);
const mailer = createMailer();
setInterval(() => otp.sweep(), 60_000).unref();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "1");
app.use(express.json({ limit: "4kb" }));
app.use((req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" });
  next();
});

// Per-IP limit on top of the per-email limits in otp.js.
const hits = new Map();
function ipLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.path}|${req.ip}`, t = Date.now();
    const list = (hits.get(key) || []).filter(x => t - x < windowMs);
    if (list.length >= max) return res.status(429).json({ ok: false, error: "Too many requests from this network. Try again later." });
    list.push(t); hits.set(key, list); next();
  };
}

app.get("/api/health", (req, res) => res.json({ ok: true, mail: mailer.live ? "gmail" : "dev" }));

app.post("/api/otp/request", ipLimit(20, 60 * 60 * 1000), async (req, res) => {
  const email = normaliseEmail(req.body?.email);
  const role = classifyEmail(email);
  if (!role) return res.status(400).json({ ok: false, error: "Use your college email, like 26bcp160@sot.pdpu.ac.in." });
  if (req.body?.role && req.body.role !== role) {
    return res.status(400).json({ ok: false, error: role === "student" ? "That's a student email. Choose \"I'm a student\"." : "Student emails look like 26bcp160@sot.pdpu.ac.in." });
  }
  let code;
  try { code = otp.issue(email); }
  catch (e) { return sendError(res, e); }
  try {
    await mailer.sendCode(email, code, OTP_TTL_MS / 60000);
  } catch (e) {
    otp.revoke(email);
    console.error("Mail send failed:", e.message);
    return res.status(502).json({ ok: false, error: "We couldn't send the email right now. Try again in a minute." });
  }
  res.json({ ok: true, role, expiresIn: OTP_TTL_MS / 1000, resendIn: RESEND_MS / 1000, delivery: mailer.live ? "gmail" : "dev" });
});

app.post("/api/otp/verify", ipLimit(60, 60 * 60 * 1000), (req, res) => {
  const email = normaliseEmail(req.body?.email);
  try {
    otp.verify(email, String(req.body?.code || "").trim());
    const role = classifyEmail(email);
    res.json({ ok: true, role, token: signToken(SECRET, { sub: email, role }) });
  } catch (e) { sendError(res, e); }
});

app.use("/api", (req, res) => res.status(404).json({ ok: false, error: "Not found" }));

// Only the app page is public; never expose the server folder.
const page = path.join(here, "..", "index.html");
app.get(["/", "/index.html"], (req, res) => res.sendFile(page));

app.use((err, req, res, next) => {
  if (err?.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Bad request" });
  console.error(err); res.status(500).json({ ok: false, error: "Something went wrong on our side." });
});

function sendError(res, e) {
  if (e instanceof OtpError) return res.status(e.status).json({ ok: false, error: e.message, ...e.extra });
  console.error(e); return res.status(500).json({ ok: false, error: "Something went wrong on our side." });
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`CollegeOS running at http://localhost:${PORT}`);
    console.log(mailer.live ? `Emailing codes from ${process.env.GMAIL_USER} via Gmail.` : "Gmail not configured: codes are printed here instead of emailed.");
    if (mailer.live) mailer.verify().catch(e => console.error("Gmail login failed:", e.message, "\nCheck GMAIL_USER and GMAIL_APP_PASSWORD in server/.env"));
  });
}

export default app;
