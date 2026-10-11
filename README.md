# AURA Monitor

A personal skin & hair monitor with a floating, pointer-reactive interface. Plain HTML/CSS/JS, no build step, no backend.

Open `index.html` in a browser, or host the folder on GitHub Pages.

## Pages

- **Dashboard**: skin and hair scores on floating 3D panels that follow your pointer, 7-day trends, insights and alerts, today's routine, a 6-week calendar and a breakout face map.
- **Check-in**: daily log for skin (oiliness, dryness, redness, sensitivity, breakouts and where), hair (hair fall count, itch, flakes, scalp oil, frizz, wash day), lifestyle (sleep, water, stress, sun, food, period, workout), routine steps, warning signs and notes. Saves automatically.
- **Scan**: on-device photo analysis. Face scans estimate shine, redness, dark spots and evenness. Hair-parting scans estimate how much scalp shows and flakes. History chart and a before/after slider.
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
