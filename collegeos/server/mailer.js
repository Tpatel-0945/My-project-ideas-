// Sends the sign-in code.
//   MAIL_PROVIDER=gmail  Gmail SMTP with an App Password. Best when you run the server on your own laptop.
//   MAIL_PROVIDER=brevo  Brevo's HTTPS email API. Use this on hosts that block email ports (Render/Railway free plans).
// If nothing is configured the server runs in "dev" mode and prints codes in the terminal.
import nodemailer from "nodemailer";

export function pickProvider(env = process.env) {
  const want = (env.MAIL_PROVIDER || "").toLowerCase();
  const hasGmail = Boolean(env.GMAIL_USER && env.GMAIL_APP_PASSWORD);
  const hasBrevo = Boolean(env.BREVO_API_KEY);
  if (want === "brevo" || (!want && hasBrevo && !hasGmail)) return hasBrevo ? "brevo" : "misconfigured";
  if (want === "gmail" || (!want && hasGmail)) return hasGmail ? "gmail" : "misconfigured";
  return "dev";
}

// Turn transport errors into one sentence the person running the server can act on.
export function explainMailError(e, provider) {
  const msg = String(e?.message || e);
  if (provider === "gmail") {
    if (e?.code === "EAUTH" || /535|Username and Password not accepted|BadCredentials/i.test(msg))
      return "Gmail rejected the login. GMAIL_APP_PASSWORD must be a 16-character App Password (not your normal password) for the account in GMAIL_USER, with 2-Step Verification on. College accounts usually can't make App Passwords: use a personal Gmail, or MAIL_PROVIDER=brevo.";
    if (["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNREFUSED", "ENETUNREACH", "ENOTFOUND", "EAI_AGAIN"].includes(e?.code) || /timeout|ENETUNREACH|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(msg))
      return "Couldn't reach Gmail's mail server. This network or host blocks email ports (Render and Railway free plans do). Set MAIL_PROVIDER=brevo instead.";
  }
  if (provider === "brevo") {
    if (/401|unauthorized|key not found/i.test(msg)) return "Brevo rejected the API key. Check BREVO_API_KEY.";
    if (/sender|not valid|not verified/i.test(msg)) return "Brevo hasn't verified the sender address. Verify MAIL_FROM_EMAIL under Senders in Brevo.";
  }
  if (provider === "misconfigured") return "MAIL_PROVIDER is set but its credentials are missing in server/.env.";
  return msg.slice(0, 200);
}

export function createMailer(env = process.env) {
  const provider = pickProvider(env);
  const user = env.GMAIL_USER;
  const fromEmail = env.MAIL_FROM_EMAIL || user || "no-reply@collegeos.local";
  const fromName = env.MAIL_FROM_NAME || "CollegeOS";
  let gmail = null;
  if (provider === "gmail") {
    gmail = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user, pass: env.GMAIL_APP_PASSWORD.replace(/\s+/g, "") },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    });
  }
  const status = { provider, ready: provider === "dev", error: null, checkedAt: null };

  async function brevoSend(msg) {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { name: fromName, email: fromEmail }, to: [{ email: msg.to }], subject: msg.subject, htmlContent: msg.html, textContent: msg.text }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${body.message || body.code || "request failed"}`);
    return body;
  }

  async function verify() {
    status.checkedAt = new Date().toISOString();
    try {
      if (provider === "gmail") await gmail.verify();
      else if (provider === "brevo") {
        const r = await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": env.BREVO_API_KEY, accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
        if (!r.ok) throw new Error(`Brevo ${r.status}: unauthorized`);
      } else if (provider === "misconfigured") throw new Error("missing credentials");
      status.ready = true; status.error = null;
    } catch (e) {
      status.ready = false; status.error = explainMailError(e, provider);
    }
    return status;
  }

  async function sendCode(to, code, minutes) {
    const msg = { to, subject: `${code} is your CollegeOS sign-in code`, text: otpText(code, minutes), html: otpHtml(code, minutes, to) };
    if (provider === "dev") {
      console.log(`\n┌─ DEV MODE: email is not set up, so here is the code ─\n│ To:   ${to}\n│ Code: ${code}\n└───────────────────────────────────────────────────────\n`);
      return { dev: true };
    }
    try {
      const info = provider === "gmail"
        ? await gmail.sendMail({ from: `${fromName} <${fromEmail}>`, ...msg })
        : await brevoSend(msg);
      status.ready = true; status.error = null;
      console.log(`Sent sign-in code to ${to} via ${provider}`);
      return info;
    } catch (e) {
      status.ready = false; status.error = explainMailError(e, provider);
      e.friendly = status.error;
      throw e;
    }
  }

  return { provider, status, sendCode, verify, fromEmail };
}

export function otpText(code, minutes) {
  return `Your CollegeOS sign-in code is ${code}.\n\nIt works for ${minutes} minutes and can be used once.\nIf you didn't try to sign in, you can ignore this email.\n`;
}

// Gmail strips <style> in some clients, so everything is inline and table-based.
export function otpHtml(code, minutes, to) {
  const digits = code.split("").map(d =>
    `<td style="width:46px;height:58px;border:1px solid #2a2a31;border-radius:10px;background:#111115;text-align:center;font:600 28px/58px 'JetBrains Mono',Menlo,Consolas,monospace;color:#ecebe6">${d}</td>`
  ).join('<td style="width:8px"></td>');
  return `<!doctype html><html><body style="margin:0;padding:0;background:#000000">
<div style="display:none;max-height:0;overflow:hidden">Your CollegeOS code is ${code}. It expires in ${minutes} minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000000;padding:40px 16px">
 <tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#0a0a0c;border:1px solid #1d1d22;border-radius:16px;overflow:hidden">
   <tr><td style="height:4px;background:linear-gradient(90deg,#8fa3bd,#59c7e8,#6bdb98,#f2c14e,#f4895a,#e46fd6);background-color:#59c7e8"></td></tr>
   <tr><td style="padding:32px 32px 8px;font:800 20px/1.2 'Segoe UI',Helvetica,Arial,sans-serif;color:#ecebe6">CollegeOS</td></tr>
   <tr><td style="padding:8px 32px 0;font:600 24px/1.25 'Segoe UI',Helvetica,Arial,sans-serif;color:#ecebe6">Your sign-in code</td></tr>
   <tr><td style="padding:10px 32px 24px;font:400 15px/1.55 'Segoe UI',Helvetica,Arial,sans-serif;color:#8a8a93">Enter this code on the CollegeOS sign-in page to finish signing in as <span style="color:#ecebe6">${escapeHtml(to)}</span>.</td></tr>
   <tr><td style="padding:0 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${digits}</tr></table></td></tr>
   <tr><td style="padding:24px 32px 32px;font:400 13px/1.6 'Segoe UI',Helvetica,Arial,sans-serif;color:#8a8a93">The code works for <b style="color:#ecebe6">${minutes} minutes</b> and only once. Nobody from your college will ever ask you for it. If you didn't try to sign in, ignore this email.</td></tr>
  </table>
  <p style="margin:18px 0 0;font:400 12px/1.5 'Segoe UI',Helvetica,Arial,sans-serif;color:#5a5a63">Sent by CollegeOS because a sign-in was requested for this address.</p>
 </td></tr>
</table></body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
