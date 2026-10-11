# AURA Monitor

A personal skin & hair monitor with a floating, pointer-reactive interface. Plain HTML/CSS/JS, no build step, no backend.

Open `index.html` in a browser, or host the folder on GitHub Pages.

## Pages

- **Dashboard**: skin and hair scores on floating 3D panels that follow your pointer, 7-day trends, insights and alerts, today's routine, a 6-week calendar and a breakout face map.
- **Check-in** (optional): daily log for skin (oiliness, dryness, redness, sensitivity, breakouts and where), hair (hair fall count, itch, flakes, scalp oil, frizz, wash day), lifestyle (sleep, water, stress, sun, food, period, workout), routine steps, warning signs and notes. Saves automatically.
- **Scan**: upload a photo (dashboard or Scan page) and it is scanned automatically.
  - **Face photos** run through MediaPipe Face Landmarker (478 3D landmarks, on-device). The landmarks give a real 3D face mesh textured with your photo (rotatable, depth slider, mesh view) and exact regions for analysis: **wrinkles** (forehead, frown lines, crow's feet, under-eye, smile lines; Hessian valley filter with orientation checks, scored by line length and depth), **dark spots** (CIELAB darkness vs surrounding skin, must be darker on all sides, sized in mm using the ~63 mm average pupil distance), red/inflamed spots and shine. Eyes, brows, lips, nostrils and nose creases are excluded.
  - **Hair-parting photos** and faces the model can't find fall back to colour analysis with a 3D relief view.
  - Every finding is numbered on the 3D model and in a list; each problem gets an evidence-based fix plan (morning/night steps, habits, timeline, when to see a dermatologist) that can be added to the routine. Results fill in today's check-in. History, trend chart and before/after compare.
  - Model files live in `vendor/mediapipe/` (see its README); the JS bundle loads from jsDelivr. Serve the folder over http (not `file://`) for face mode.
- **Trends**: interactive chart (hover or drag to read any day), period-vs-period comparison, patterns found in your own logs (for example, breakouts vs short sleep), and a 13-week calendar.
- **Fuel**: daily targets for energy, protein, carbs, fat, fibre and water calculated from your sex, age, weight, height, activity and goal (Mifflin-St Jeor, ICMR-NIN 2020/2024, IOM, EFSA). Hydration tracker, an evidence summary on skipping lunch to avoid carbs, a lunch plate builder with Indian foods (carbs, protein, fibre, carb-to-fibre ratio), a skin & hair nutrient table and a sample day. Sources are listed on the page.
- **Sleep**: set a wake-up alarm, tap "Start sleep" at bedtime; the page rings at the alarm time (snooze, sleep-mode screen), records the night and fills in the check-in. If the page was closed, it asks in the morning and uses the alarm time. Bedtime calculator, 14-night chart, sleep debt, bedtime consistency, quality ratings, and skin/hair after good vs short sleep. A website cannot read your phone's own alarm app, so keep that alarm as a backup.
- **Routine**: AM/PM checklist, streak, per-step consistency, skin score on nights the routine was done vs skipped, and conflict warnings (retinoid + acid, BPO + vitamin C, missing sunscreen).
- **Me**: profile, reminders (with Google Calendar links), backup and restore, privacy and safety notes.

## Alerts

The monitor raises a "see a dermatologist" alert when you tick a warning sign (changing mole, hair in clumps, cysts, rash with swelling or fever), when hair fall stays above 150/day for a week or suddenly jumps, or when breakouts stay high.

## Data

Everything is stored in your browser's `localStorage` (`auram.db`). Photos are analysed on-device and saved only as small thumbnails. The first visit shows 45 days of sample data; use "Start tracking my own data" to clear it.

Not medical advice. Photo scores are colour-based estimates and change with lighting.
