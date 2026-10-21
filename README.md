# AURA Monitor

A personal skin & hair monitor. Plain HTML/CSS/JS, no build step, no backend.

The interface sits in a real-time 3D space scene (three.js): stars, a ringed planet, a moon, glass orbs, drifting rocks and water molecules that move with your pointer and scroll. It is interactive: the camera flies to a new viewpoint on each page (the moon comes close on Sleep), the mouse leaves a stardust trail, objects swell when you hover them, clicking empty space sends a shockwave that pushes them away, dragging empty space spins the stars, and shooting stars cross now and then. Cards are smoked glass with film grain and a vignette; type is Unbounded / Onest / JetBrains Mono.

Open `index.html` through a local web server (for example `python3 -m http.server`), or deploy it (steps below).

## Pages

- **Dashboard**: skin and hair scores on floating 3D panels that follow your pointer, 7-day trends, insights and alerts, today's routine, a 6-week calendar and a breakout face map.
- **Check-in** (optional): daily log for skin (oiliness, dryness, redness, sensitivity, breakouts and where), hair (hair fall count, itch, flakes, scalp oil, frizz, wash day), lifestyle (sleep, water, stress, sun, food, period, workout), routine steps, warning signs and notes. Saves automatically.
- **Scan**: upload a photo (dashboard or Scan page) and it is scanned automatically.
  - **Face photos** run through MediaPipe Face Landmarker (478 3D landmarks, on-device). The landmarks give a real 3D face mesh textured with your photo (rotatable, depth slider, mesh view) and exact regions for analysis: **wrinkles** (forehead, frown lines, crow's feet, under-eye, smile lines; Hessian valley filter with orientation checks, scored by line length and depth), **dark spots** (CIELAB darkness vs surrounding skin, must be darker on all sides, sized in mm using the ~63 mm average pupil distance), red/inflamed spots and shine. Eyes, brows, lips, nostrils and nose creases are excluded.
  - **Hair-parting photos** and faces the model can't find fall back to colour analysis with a 3D relief view.
  - The 3D face opens on a **problem map**: each area (forehead, between brows, eye corners, under-eyes, smile lines, cheeks, nose, chin) is outlined red or amber by how many problems it holds. Label cards beside the face point to each spot with a leader line, and **"Show me each problem"** rotates and zooms the camera to each one with what it is and how to fix it. Mouse-wheel / + − zoom.
  - **Acne:** pimples (redder than the skin around them) appear as raised red bumps on the 3D face, white-headed ones with a white tip; blackheads on the nose are counted (approximate: very small, limited by photo resolution); an overall grade (clear / mild / moderate / severe) is shown.
  - **Auto-fill:** each scan fills today's check-in: oiliness, redness, pimples and where, white heads, blackheads, dark spots, lines score, tone evenness, plus estimated dryness and sensitivity, and suggests a skin type.
  - **Scan reliability:** every scan is checked for resolution, sharpness, exposure, even lighting, head turn, expression (smiling deepens lines, so line scores are halved) and beauty filters (unnaturally smooth skin). It gets a 0–100 reliability score with what to fix. Below 50, the check-in is not filled unless you choose "Fill anyway".
  - Every finding is numbered on the 3D model and in a list; each problem gets an evidence-based fix plan (morning/night steps, habits, timeline, when to see a dermatologist) that can be added to the routine. Results fill in today's check-in. History, trend chart and before/after compare.
  - Model files live in `vendor/mediapipe/` (see its README); the JS bundle loads from jsDelivr. Serve the folder over http (not `file://`) for face mode.
- **Trends**: interactive chart (hover or drag to read any day), period-vs-period comparison, patterns found in your own logs (for example, breakouts vs short sleep), and a 13-week calendar.
- **Fuel**: built around a **muesli lunch** (set "At lunchtime I…" and your diet type in Personalise). A muesli bowl builder (bases, milk/curd/soy, seeds, fruit; presets: skin & hair, bircher, vegan, workout day) checks protein (~25 g), carbs (≤45 g), fibre and added sugar; a timeline plans breakfast, snack and dinner to make up what the bowl doesn't cover, with dinner timed from your alarm. Evidence notes cover muesli's glycaemic index, protein, sugar, dairy and acne, and oat beta-glucan. Also: daily targets for energy, protein, carbs, fat, fibre and water calculated from your sex, age, weight, height, activity and goal (Mifflin-St Jeor, ICMR-NIN 2020/2024, IOM, EFSA). Hydration tracker with a 3D glass of water that fills as you log glasses (tap the glass to add one), an evidence summary on skipping lunch to avoid carbs, a lunch plate builder with Indian foods (carbs, protein, fibre, carb-to-fibre ratio), a skin & hair nutrient table and a sample day. Sources are listed on the page.
- **Sleep**: a 3D twin-bell alarm clock showing the real time. Drag its brass hand to set the alarm (5-minute steps, AM/PM chips); it shakes and rings at the alarm time. Set a wake-up alarm, tap "Start sleep" at bedtime; the page rings at the alarm time (snooze, sleep-mode screen), records the night and fills in the check-in. If the page was closed, it asks in the morning and uses the alarm time. Bedtime calculator, 14-night chart, sleep debt, bedtime consistency, quality ratings, and skin/hair after good vs short sleep. A website cannot read your phone's own alarm app, so keep that alarm as a backup.
- **Routine**: AM/PM checklist, streak, per-step consistency, skin score on nights the routine was done vs skipped, and conflict warnings (retinoid + acid, BPO + vitamin C, missing sunscreen).
- **Derma (AI coach)**: the "Ask Derma" button opens a chat with Derma, powered by Google Gemini. Paste your own free key from [Google AI Studio](https://aistudio.google.com/apikey) once; Derma picks the newest "flash" model the key can use. It knows your profile, targets, muesli bowl, today's check-in, 14-day averages, routine, alarm and latest scan, streams its replies, takes photos (attach one, or "Look at my scan photo"), voice input and read-aloud. "Ask Derma" buttons on the Scan and Fuel pages start a focused question. The key is kept only in this browser (never synced, never in the code); restrict it to your site's address in Google Cloud Console → Credentials. Chats are sent to Google.
- **Lock & sign-in screen**: on first visit you can lock AURA with a 4- or 6-digit PIN (salted PBKDF2 hash, stored on this device only) and add Face ID / fingerprint (WebAuthn, on supported phones, iPads and laptops). It locks when the site opens and after a chosen time in the background (lock icon in the top bar = lock now). Five wrong tries pause entry. "Forgot PIN" resets the lock and removes local data (your account copy is safe). With Firebase configured, the same screen requires signing in first.
- **Me**: privacy lock, Derma settings, account (sign in with Google or email to sync across devices), profile, reminders (with Google Calendar links), backup and restore, privacy and safety notes.

## Alerts

The monitor raises a "see a dermatologist" alert when you tick a warning sign (changing mole, hair in clumps, cysts, rash with swelling or fever), when hair fall stays above 150/day for a week or suddenly jumps, or when breakouts stay high.

## Data & backups

- **On the device:** everything is stored in the browser's IndexedDB database (`aura`): the main record, scan photos (stored once and shared by every backup), and automatic backups. It holds hundreds of MB, so photos are never dropped to make room. A small copy without photos is mirrored to `localStorage` as a fallback. The app asks the browser to protect its storage from automatic clean-up; installing AURA as an app makes that reliable (Safari clears sites you haven't visited for 7 days otherwise).
- **Automatic backups:** one every day on the device (last 14 kept), a safety copy before anything that replaces data (restore, sample data), and, when signed in, one every week in your account (last 8 kept). Restore any of them under **Me → Data & backups**.
- **Backup files:** **Back up to a file** makes one file with everything, photos included, optionally encrypted with a password (AES-256-GCM, key from PBKDF2-SHA256 with 600,000 rounds). Download it or share it to Google Drive, iCloud, email or WhatsApp. **Restore from a file** previews what's inside and lets you **merge** (keeps the newer version of each day, loses nothing) or **replace** (also updates every signed-in device). Older plain backups still work.
- **Self-repair:** on every start the data is checked and anything malformed is fixed. If the main record is lost or damaged, AURA recovers from its copy and the latest automatic backup, keeps the damaged data aside, and tells you. **Check & repair** runs the same check on demand and confirms the data reads back correctly.
- Two open tabs stay in step instead of overwriting each other. Failed uploads to your account are retried on the next change.

Not medical advice. Photo scores are colour-based estimates and change with lighting.

## Backend, sign-in and the phone app

AURA syncs through **your own Firebase project** (Google's Authentication + Cloud Firestore), so you sign in on any phone, iPad or computer and see everything you've recorded. Data is stored one document per day, per scan and per conversation, so it keeps scaling for years. Every device keeps an offline copy; changes made offline upload when you reconnect, and changes from other devices appear live. `firestore.rules` lets only your account read or write your data.

The lock screen asks for your PIN on every device. The default PIN is set in `js/lock-config.js`, which holds only a salted PBKDF2-SHA256 hash; make a new one with `node tools/pin-hash.mjs 123456`. A PIN changed in the app follows your account. Right after a fresh sign-in the PIN isn't asked; on later opens it is.

It installs as an app (manifest + service worker): home-screen icon, full screen, offline start. Icons are made from any square image with `python3 tools/make_icons.py your-icon.png`.

**Step-by-step setup, publishing on Firebase Hosting and installing on your phone: see [DEPLOY.md](DEPLOY.md).**
