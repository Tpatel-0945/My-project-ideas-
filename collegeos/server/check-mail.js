// Check your email setup without opening the app:
//   npm run check-mail -- 26bcp160@sot.pdpu.ac.in
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "./env.js";
import { createMailer } from "./mailer.js";

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(here, ".env"));
const to = process.argv[2];
if (!to) { console.error("Usage: npm run check-mail -- your.email@sot.pdpu.ac.in"); process.exit(1); }

const mailer = createMailer();
console.log(`Provider: ${mailer.provider}`);
if (mailer.provider === "dev") {
  console.error("\n✗ Email isn't set up. Copy .env.example to .env and fill in Gmail or Brevo details.");
  process.exit(1);
}
const s = await mailer.verify();
if (!s.ready) { console.error(`\n✗ Login check failed: ${s.error}`); process.exit(1); }
console.log("✓ Login works. Sending a test code…");
try {
  await mailer.sendCode(to, "123456", 5);
  console.log(`✓ Sent. Check the inbox (and Spam) of ${to}.`);
} catch (e) {
  console.error(`✗ Send failed: ${e.friendly || e.message}`);
  process.exit(1);
}
