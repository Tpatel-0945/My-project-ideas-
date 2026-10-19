// Builds collegeos/index.html from app.html: adds the document shell, app icons,
// the install manifest and service-worker registration.   node build.mjs
import fs from "node:fs";
const here = new URL(".", import.meta.url);
const app = fs.readFileSync(new URL("app.html", here), "utf8");
const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#000000">
<meta name="description" content="Your first year at PDEU in one place: attendance, leave planner, library, surveys and insights.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="CollegeOS">
</head>
<body style="margin:0;background:#000">
`;
const tail = `
<script>
// Installable app: register the service worker when served over http(s) by the CollegeOS server.
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
</script>
</body>
</html>
`;
const page = head + app + tail;
fs.writeFileSync(new URL("index.html", here), page);

// docs/ at the repo root: a static copy for GitHub Pages (no server, so sign-in codes show on screen)
const docs = new URL("../docs/", here);
fs.mkdirSync(new URL("icons/", docs), { recursive: true });
fs.writeFileSync(new URL("index.html", docs), page);
for (const f of ["manifest.webmanifest", "sw.js"]) fs.copyFileSync(new URL("pwa/" + f, here), new URL(f, docs));
for (const f of fs.readdirSync(new URL("pwa/icons/", here))) fs.copyFileSync(new URL("pwa/icons/" + f, here), new URL("icons/" + f, docs));
fs.writeFileSync(new URL(".nojekyll", docs), "");
console.log("Built index.html and docs/ (GitHub Pages)");
