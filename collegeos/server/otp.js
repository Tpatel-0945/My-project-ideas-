// One-time sign-in codes.
// Codes are never stored in plain text: we keep an HMAC of (email, code) and compare in constant time.
import crypto from "node:crypto";

export const OTP_TTL_MS = 5 * 60 * 1000;   // a code works for 5 minutes
export const RESEND_MS = 30 * 1000;        // wait 30 s before asking for another
const MAX_ATTEMPTS = 5;                    // wrong guesses before the code is burned
const MAX_PER_HOUR = 5;                    // codes per email per hour

// Student: 26bcp160@sot.pdpu.ac.in  (2-digit year, 3-letter programme, 3-digit number)
export const STUDENT_EMAIL = /^(\d{2})([a-z]{3})(\d{3})@sot\.pdpu\.ac\.in$/;
// Faculty: firstname.lastname@sot.pdpu.ac.in or @pdpu.ac.in
export const FACULTY_EMAIL = /^[a-z][a-z0-9._-]{1,40}@(sot\.)?pdpu\.ac\.in$/;

export class OtpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

export function normaliseEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

export function classifyEmail(email) {
  if (STUDENT_EMAIL.test(email)) return "student";
  if (FACULTY_EMAIL.test(email)) return "faculty";
  return null;
}

export function createOtpStore(secret, now = () => Date.now()) {
  if (!secret || secret.length < 16) throw new Error("OTP_SECRET must be at least 16 characters");
  const records = new Map(); // email -> { mac, expires, attempts, sentAt }
  const history = new Map(); // email -> [timestamps of codes sent]

  const mac = (email, code) => crypto.createHmac("sha256", secret).update(`${email}:${code}`).digest();

  function issue(email) {
    const t = now();
    const prev = records.get(email);
    if (prev && t - prev.sentAt < RESEND_MS) {
      const retryIn = Math.ceil((RESEND_MS - (t - prev.sentAt)) / 1000);
      throw new OtpError(429, `Please wait ${retryIn} s before asking for a new code.`, { retryIn });
    }
    const sent = (history.get(email) || []).filter(x => t - x < 60 * 60 * 1000);
    if (sent.length >= MAX_PER_HOUR) {
      throw new OtpError(429, "Too many codes requested for this email. Try again in an hour.");
    }
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    records.set(email, { mac: mac(email, code), expires: t + OTP_TTL_MS, attempts: 0, sentAt: t });
    history.set(email, [...sent, t]);
    return code;
  }

  // If sending the email fails, forget the code so the user can retry at once.
  function revoke(email) { records.delete(email); }

  function verify(email, code) {
    const rec = records.get(email);
    if (!rec) throw new OtpError(400, "No active code for this email. Ask for a new one.");
    if (now() > rec.expires) { records.delete(email); throw new OtpError(400, "This code has expired. Ask for a new one."); }
    if (!/^\d{6}$/.test(String(code || ""))) throw new OtpError(400, "Enter the 6-digit code from the email.");
    const ok = crypto.timingSafeEqual(rec.mac, mac(email, String(code)));
    if (!ok) {
      rec.attempts += 1;
      const left = MAX_ATTEMPTS - rec.attempts;
      if (left <= 0) { records.delete(email); throw new OtpError(400, "Too many wrong codes. Ask for a new one."); }
      throw new OtpError(400, `That code doesn't match. ${left} attempt${left === 1 ? "" : "s"} left.`, { attemptsLeft: left });
    }
    records.delete(email); // single use
    return true;
  }

  function sweep() {
    const t = now();
    for (const [k, r] of records) if (t > r.expires) records.delete(k);
    for (const [k, h] of history) { const f = h.filter(x => t - x < 3600e3); f.length ? history.set(k, f) : history.delete(k); }
  }

  return { issue, verify, revoke, sweep, _records: records };
}

// Small signed session token (HMAC-SHA256), so the page can prove the email was verified.
export function signToken(secret, payload, ttlMs = 7 * 24 * 3600e3) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readToken(secret, token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const want = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  const data = JSON.parse(Buffer.from(body, "base64url").toString());
  return data.exp > Date.now() ? data : null;
}
