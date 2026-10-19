// Renders the CollegeOS app icons (PNG) from the logo mark.   node make-icons.js
const { chromium } = require("playwright");
const path = require("path");
const OUT = path.join(__dirname, "icons");

// pad = empty margin as a fraction of the size (maskable icons need a safe zone)
const svg = (pad, round) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#8fa3bd"/><stop offset=".2" stop-color="#59c7e8"/><stop offset=".4" stop-color="#6bdb98"/>
<stop offset=".6" stop-color="#f2c14e"/><stop offset=".8" stop-color="#f4895a"/><stop offset="1" stop-color="#e46fd6"/></linearGradient></defs>
<rect width="100" height="100" rx="${round}" fill="#000"/>
<g transform="translate(${pad * 100} ${pad * 100}) scale(${1 - pad * 2})">
<rect x="14" y="14" width="72" height="72" rx="20" fill="url(#g)"/>
<rect x="24" y="24" width="52" height="52" rx="13" fill="#000"/>
<rect x="39" y="39" width="22" height="22" rx="6" fill="#ecebe6"/></g></svg>`;

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const p = await b.newPage();
  const shots = [["icon-192.png", 192, 0, 22], ["icon-512.png", 512, 0, 22], ["maskable-512.png", 512, 0.1, 0], ["apple-touch-icon.png", 180, 0.02, 0]];
  for (const [name, size, pad, round] of shots) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<body style="margin:0;background:transparent">${svg(pad, round).replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
    await p.screenshot({ path: path.join(OUT, name), omitBackground: true });
  }
  await b.close();
  console.log("Icons written to", OUT);
})();
