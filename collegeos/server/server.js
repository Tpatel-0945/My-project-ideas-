// CollegeOS backend: serves the app and handles email one-time-code sign-in.
//   POST /api/otp/request  { email }        -> emails a 6-digit code
//   POST /api/otp/verify   { email, code }  -> returns a signed session token
//   GET  /api/health                         -> { ok, mail: { provider, ready, error } }
import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "./env.js";
import { createOtpStore, classifyEmail, normaliseEmail, signToken, OtpError, OTP_TTL_MS, RESEND_MS } from "./otp.js";
import { createMailer } from "./mailer.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const hadEnv = loadDotEnv(path.join(here, ".env"));

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.OTP_SECRET || crypto.randomBytes(32).toString("hex");

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
const isLocal = req => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress) && !req.headers["x-forwarded-for"];

app.get("/api/health", (req, res) => {
  const { provider, ready, error } = mailer.status;
  res.json({ ok: true, mail: { provider, ready, error: isLocal(req) ? error : (error ? "Email isn't working on the server." : null) } });
});

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
    console.error(`✗ Couldn't email ${email}: ${e.friendly || e.message}`);
    return res.status(502).json({ ok: false, error: "We couldn't send the email. " + (isLocal(req) ? e.friendly : "Please try again in a minute or tell your admin.") });
  }
  const out = { ok: true, role, expiresIn: OTP_TTL_MS / 1000, resendIn: RESEND_MS / 1000, delivery: mailer.provider };
  // Email isn't set up yet: hand the code to a browser on this same computer so local testing still works.
  if (mailer.provider === "dev" && isLocal(req)) out.devCode = code;
  res.json(out);
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, async () => {
    console.log(`\nCollegeOS running at http://localhost:${PORT}`);
    if (!hadEnv) console.log("No server/.env file found. Copy .env.example to .env to set up email.");
    if (!process.env.OTP_SECRET) console.log("OTP_SECRET not set: using a random one (sign-ins reset on restart).");
    if (mailer.provider === "dev") {
      console.log("⚠ Email is NOT set up: codes are printed here and shown on this computer's sign-in page only.");
      return;
    }
    const s = await mailer.verify();
    console.log(s.ready ? `✓ Email ready: sending codes via ${mailer.provider} from ${mailer.fromEmail}` : `✗ Email NOT working (${mailer.provider}): ${s.error}`);
  });
}

export default app;
