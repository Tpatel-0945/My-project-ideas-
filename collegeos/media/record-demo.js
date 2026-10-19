// Records collegeos/media/collegeos-demo.mp4: intro → introduction tour → college-email sign-in → app highlights.
// Needs: the CollegeOS server running (npm start in ../server), Playwright, and ffmpeg.
//   node record-demo.js [http://localhost:8787]
// Email replies are simulated in the browser so the video doesn't depend on a mail account.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");

const URL = process.argv[2] || "http://localhost:8787/";
const OUT = path.join(__dirname, "collegeos-demo.mp4");
const FRAMES = path.join(__dirname, ".frames");
const W = 1920, H = 1080, CODE = "482913", EMAIL = "26bcp160@sot.pdpu.ac.in";

(async () => {
  fs.rmSync(FRAMES, { recursive: true, force: true }); fs.mkdirSync(FRAMES);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  // Simulated mail server replies
  await page.route("**/api/health", r => r.fulfill({ json: { ok: true, mail: { provider: "gmail", ready: true, error: null } } }));
  await page.route("**/api/otp/request", r => r.fulfill({ json: { ok: true, role: "student", expiresIn: 300, resendIn: 30, delivery: "gmail" } }));
  await page.route("**/api/otp/verify", r => r.fulfill({ json: { ok: true, role: "student", token: "demo" } }));

  // Visible cursor + caption layer (videos don't show the real pointer)
  await page.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = `#vcur{position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,255,255,.9);box-shadow:0 0 0 6px rgba(255,255,255,.18),0 4px 18px rgba(0,0,0,.5);z-index:2147483647;pointer-events:none;transition:transform .15s;opacity:0}
      #vcur.down{transform:scale(.7)}
      #vcap{position:fixed;left:50%;bottom:54px;transform:translate(-50%,20px);z-index:2147483646;pointer-events:none;padding:14px 26px;border-radius:999px;background:rgba(10,10,14,.78);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.12);color:#ecebe6;font:600 24px/1.2 "Bricolage Grotesque",system-ui,sans-serif;letter-spacing:-.01em;opacity:0;transition:opacity .5s,transform .6s cubic-bezier(.2,.8,.2,1);white-space:nowrap}
      #vcap.on{opacity:1;transform:translate(-50%,0)}
      #vmail{position:fixed;inset:0;z-index:2147483645;display:grid;place-items:center;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);opacity:0;transition:opacity .5s;pointer-events:none}
      #vmail.on{opacity:1}
      #vmail .ph{width:520px;border-radius:28px;overflow:hidden;border:1px solid rgba(255,255,255,.14);background:#000;box-shadow:0 30px 80px rgba(0,0,0,.6);transform:translateY(30px) scale(.96);transition:transform .7s cubic-bezier(.2,.8,.2,1)}
      #vmail.on .ph{transform:none}
      #vmail .bar{display:flex;align-items:center;gap:10px;padding:16px 20px;background:#111115;color:#ecebe6;font:600 16px system-ui}
      #vmail .bar i{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#59c7e8,#e46fd6)}
      #vmail .bar span{color:#8a8a93;font-weight:400;font-size:13px;display:block}
      #vmail iframe{width:520px;height:520px;border:0;display:block;background:#000}`;
      document.head.appendChild(st);
      const c = document.createElement("div"); c.id = "vcur"; document.body.appendChild(c);
      const cap = document.createElement("div"); cap.id = "vcap"; document.body.appendChild(cap);
      addEventListener("mousemove", e => { c.style.opacity = 1; c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
      addEventListener("mousedown", () => c.classList.add("down"), true);
      addEventListener("mouseup", () => c.classList.remove("down"), true);
    });
  });

  // Deterministic capture: pause the page clock, then advance it exactly one frame (1/30 s) per screenshot.
  // Animations, timers and the canvas all run on that clock, so motion is perfectly smooth.
  const cdp = await ctx.newCDPSession(page);
  const FPS = 30, STEP = 1000 / FPS; let n = 0;
  const advance = ms => new Promise(res => {
    let done = false; const fin = () => { if (!done) { done = true; res(); } };
    cdp.once("Emulation.virtualTimeBudgetExpired", fin);
    cdp.send("Emulation.setVirtualTimePolicy", { policy: "pauseIfNetworkFetchesPending", budget: ms }).catch(fin);
    // if a request hangs, don't stall the recording: move the clock on anyway
    setTimeout(() => { if (!done) cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: ms }).catch(fin); }, 3000);
    setTimeout(fin, 6000);
  });
  const frame = async () => {
    await advance(STEP);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 90 });
    fs.writeFileSync(path.join(FRAMES, String(n++).padStart(6, "0") + ".jpg"), Buffer.from(data, "base64"));
  };
  const sleep = async ms => { for (let k = 0; k < Math.round(ms / STEP); k++) await frame(); };
  const caption = async (t, ms = 2600) => {
    await page.evaluate(t => { const e = document.getElementById("vcap"); if (!t) { e.classList.remove("on"); return; } e.textContent = t; e.classList.add("on"); }, t);
    if (ms) { await sleep(ms); await page.evaluate(() => document.getElementById("vcap").classList.remove("on")); await sleep(500); }
  };
  let mx = W / 2, my = H / 2;
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const moveTo = async (x, y, ms = 650) => {
    const fx = mx, fy = my, k = Math.max(1, Math.round(ms / STEP));
    for (let f = 1; f <= k; f++) { const t = ease(f / k); await page.mouse.move(fx + (x - fx) * t, fy + (y - fy) * t); await frame(); }
    mx = x; my = y;
  };
  const click = async (sel, wait = 500) => {
    const box = await page.locator(sel).first().boundingBox();
    await moveTo(box.x + box.width / 2, box.y + box.height / 2); await sleep(180);
    await page.mouse.down(); await sleep(100); await page.mouse.up(); await sleep(wait);
  };
  const type = async (sel, text, delay = 75) => { await click(sel, 200); for (const ch of text) { await page.keyboard.type(ch); await sleep(delay); } };
  const smoothScroll = async (y, ms = 1400) => {
    const from = await page.evaluate(() => scrollY), k = Math.round(ms / STEP);
    for (let f = 1; f <= k; f++) { await page.evaluate(v => window.scrollTo(0, v), from + (y - from) * ease(f / k)); await frame(); }
  };

  // First load warms the cache (fonts, page); then reload with the clock paused so the intro starts at frame 0.
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.evaluate(() => localStorage.clear());
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  await cdp.send("Page.reload", {});
  await sleep(200); // let the reloaded page start before sending any input
  await page.mouse.move(W / 2, H + 50); mx = W / 2; my = H + 50;

  // 1. Logo intro + 2. animated introduction (auto-advances)
  await sleep(3000 + 5200 + 4600 + 4600 + 4600 + 3600);
  await click("#tNext", 1200);

  // 3. Sign in with a college email
  await caption("Sign in with your college email", 0);
  await type("#gMail", EMAIL, 70); await sleep(500);
  await click("#gEmail button[type=submit]", 900);
  await caption(null, 0);
  // The code arrives in Gmail
  const { otpHtml } = await import("../server/mailer.js");
  const mailHtml = otpHtml(CODE, 5, EMAIL);
  await page.evaluate(([html, code]) => {
    const o = document.createElement("div"); o.id = "vmail";
    o.innerHTML = `<div class="ph"><div class="bar"><i></i><div>CollegeOS<span>${code} is your CollegeOS sign-in code</span></div></div><iframe></iframe></div>`;
    document.body.appendChild(o); o.querySelector("iframe").srcdoc = html; requestAnimationFrame(() => o.classList.add("on"));
  }, [mailHtml || `<body style="background:#000;color:#fff;font:28px system-ui;display:grid;place-items:center;height:100vh;margin:0">Your code: ${CODE}</body>`, CODE]);
  await caption("The 6-digit code lands in Gmail", 3200);
  await page.evaluate(() => { const o = document.getElementById("vmail"); o.classList.remove("on"); setTimeout(() => o.remove(), 600); });
  await sleep(700);
  await type("#gCode", CODE, 160); await sleep(1300);

  await caption("Roll number, branch and semester fill in automatically", 0);
  await type("#gName", "Tanish Patel", 85); await sleep(900);
  await caption(null, 0);
  await click("#gProf button[type=submit]", 1800);

  // 4. A quick look around
  await caption("Your week at a glance", 2200);
  await smoothScroll(520, 1800); await smoothScroll(0, 1200);
  await click('[data-go="library"]', 900);
  await caption("A library for every first-year subject", 0);
  await sleep(1200);
  await click('[data-subj="cp1"]', 1600);
  await smoothScroll(420, 1500);
  await click('[data-lib="cp1-ws"]', 1600);
  await caption(null, 0);
  await click("#rdAns", 1400);
  for (let f = 1; f <= 45; f++) { await page.evaluate(v => document.getElementById("rdBody").scrollTo(0, v), 520 * ease(f / 45)); await frame(); }
  await sleep(500);
  await click("#rdClose", 600);
  await click('[data-lib="cp1-map"]', 2600);
  await click("#rdClose", 600);
  await click('[data-go="leave"]', 600);
  await caption("Plan leave without falling short", 3000);
  await click('[data-go="surveys"]', 600);
  await caption("Tell faculty how a topic went, anonymously", 2600);
  await click("#roleFaculty", 900);
  await click('[data-go="fsurveys"]', 600);
  await caption("Faculty see whether to reteach", 2600);
  await smoothScroll(700, 2000);

  // End card
  await page.evaluate(() => {
    const e = document.createElement("div");
    e.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#000;display:grid;place-items:center;opacity:0;transition:opacity .8s";
    e.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:22px"><span class="imark"><i></i></span><div class="iword" style="font-size:96px">College<span class="os" style="display:inline-block">OS</span></div><div class="iline" style="width:280px;animation:none"></div><p class="itag" style="animation:none">Your first year, in one place</p></div>`;
    document.body.appendChild(e); requestAnimationFrame(() => e.style.opacity = 1);
  });
  await sleep(3800);
  await browser.close();

  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(FRAMES, "%06d.jpg"),
    "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-movflags", "+faststart", OUT], { stdio: "inherit" });
  fs.rmSync(FRAMES, { recursive: true, force: true });
  console.log(`Saved ${OUT} (${n} frames, ${(n / FPS).toFixed(1)} s)`);
})();
