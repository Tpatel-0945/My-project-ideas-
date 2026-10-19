import { test } from "node:test";
import assert from "node:assert/strict";
import { pickProvider, explainMailError, createMailer } from "./mailer.js";

test("picks the provider from settings", () => {
  assert.equal(pickProvider({}), "dev");
  assert.equal(pickProvider({ GMAIL_USER: "a@gmail.com", GMAIL_APP_PASSWORD: "x" }), "gmail");
  assert.equal(pickProvider({ BREVO_API_KEY: "k" }), "brevo");
  assert.equal(pickProvider({ MAIL_PROVIDER: "brevo", GMAIL_USER: "a", GMAIL_APP_PASSWORD: "b" }), "misconfigured");
  assert.equal(pickProvider({ MAIL_PROVIDER: "gmail" }), "misconfigured");
});

test("explains common Gmail failures in plain words", () => {
  assert.match(explainMailError({ code: "EAUTH", message: "535-5.7.8 Username and Password not accepted" }, "gmail"), /App Password/);
  assert.match(explainMailError({ code: "ETIMEDOUT", message: "Connection timeout" }, "gmail"), /blocks email ports/);
  assert.match(explainMailError(new Error("Brevo 401: Key not found"), "brevo"), /API key/);
});

test("dev mode prints instead of sending", async () => {
  const m = createMailer({});
  assert.equal(m.provider, "dev");
  assert.deepEqual(await m.sendCode("26bcp160@sot.pdpu.ac.in", "123456", 5), { dev: true });
});

test("a wrong Gmail login is reported, not hidden", async () => {
  const m = createMailer({ GMAIL_USER: "nobody@gmail.com", GMAIL_APP_PASSWORD: "wrongwrongwrongw" });
  const s = await m.verify();
  assert.equal(s.ready, false);
  assert.ok(s.error.length > 10);
});
