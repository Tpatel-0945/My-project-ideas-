// Sends the sign-in code. Uses Gmail SMTP when GMAIL_USER and GMAIL_APP_PASSWORD are set;
// otherwise prints the email to the terminal so you can develop without credentials.
import nodemailer from "nodemailer";

export function createMailer(env = process.env) {
  const user = env.GMAIL_USER;
  const pass = (env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  const live = Boolean(user && pass);
  const transport = live
    ? nodemailer.createTransport({ service: "gmail", auth: { user, pass } })
    : nodemailer.createTransport({ jsonTransport: true });
  const from = env.MAIL_FROM || (user ? `CollegeOS <${user}>` : "CollegeOS <no-reply@collegeos.local>");

  async function sendCode(to, code, minutes) {
    const msg = {
      from, to,
      subject: `${code} is your CollegeOS sign-in code`,
      text: otpText(code, minutes),
      html: otpHtml(code, minutes, to),
    };
    const info = await transport.sendMail(msg);
    if (!live) {
      console.log(`\n┌─ DEV MAIL (Gmail not configured) ─────────────\n│ To:   ${to}\n│ Code: ${code}\n└────────────────────────────────────────────────\n`);
    }
    return info;
  }

  return { live, sendCode, verify: () => (live ? transport.verify() : Promise.resolve(true)) };
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
