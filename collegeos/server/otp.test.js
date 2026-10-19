import { test } from "node:test";
import assert from "node:assert/strict";
import { createOtpStore, classifyEmail, signToken, readToken } from "./otp.js";

const SECRET = "test-secret-at-least-16";

test("accepts roll-number student emails and faculty emails only", () => {
  assert.equal(classifyEmail("26bcp160@sot.pdpu.ac.in"), "student");
  assert.equal(classifyEmail("asha.mehta@sot.pdpu.ac.in"), "faculty");
  assert.equal(classifyEmail("26bcp160@gmail.com"), null);
  assert.equal(classifyEmail("26bcp16@sot.pdpu.ac.in"), null); // malformed roll number
  assert.equal(classifyEmail("x@pdpu.ac.in.evil.com"), null);
});

test("issues a 6-digit code that verifies once", () => {
  const s = createOtpStore(SECRET);
  const code = s.issue("26bcp160@sot.pdpu.ac.in");
  assert.match(code, /^\d{6}$/);
  assert.equal(s.verify("26bcp160@sot.pdpu.ac.in", code), true);
  assert.throws(() => s.verify("26bcp160@sot.pdpu.ac.in", code), /No active code/);
});

test("stores only a hash, never the code", () => {
  const s = createOtpStore(SECRET);
  const code = s.issue("26bcp161@sot.pdpu.ac.in");
  assert.ok(!JSON.stringify([...s._records.values()]).includes(code));
});

test("burns the code after 5 wrong attempts", () => {
  const s = createOtpStore(SECRET);
  const code = s.issue("26bcp162@sot.pdpu.ac.in");
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 4; i++) assert.throws(() => s.verify("26bcp162@sot.pdpu.ac.in", wrong), /attempt/);
  assert.throws(() => s.verify("26bcp162@sot.pdpu.ac.in", wrong), /Too many wrong codes/);
  assert.throws(() => s.verify("26bcp162@sot.pdpu.ac.in", code), /No active code/);
});

test("expires after 5 minutes and enforces the resend wait", () => {
  let t = 0; const s = createOtpStore(SECRET, () => t);
  const code = s.issue("26bcp163@sot.pdpu.ac.in");
  assert.throws(() => s.issue("26bcp163@sot.pdpu.ac.in"), /wait/);
  t = 5 * 60 * 1000 + 1;
  assert.throws(() => s.verify("26bcp163@sot.pdpu.ac.in", code), /expired/);
});

test("session token round-trips and rejects tampering", () => {
  const tok = signToken(SECRET, { sub: "26bcp160@sot.pdpu.ac.in" });
  assert.equal(readToken(SECRET, tok).sub, "26bcp160@sot.pdpu.ac.in");
  assert.equal(readToken(SECRET, tok.slice(0, -2) + "xx"), null);
});
