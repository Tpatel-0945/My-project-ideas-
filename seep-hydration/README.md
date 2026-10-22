# Seep: hydration, skin and vegan nutrition for iPad

A floating, blue-themed web app built for iPad (also works on phones and desktop).
Pour water into a 3D glass, and Seep estimates what that hydration means for your skin
and checks your nutrients from your hostel mess menu plus your daily muesli lunch.

## Features

- **3D virtual glass** (Three.js): drops fall from above and seep into the water, with ripples,
  rising bubbles and measuring marks at 25/50/75/100% of your goal. Drag to turn it, tap it to pour 250 ml.
  The rim glows green once you reach your goal.
- **Hydration log**: 10 drink types with hydration factors (tea and coffee count 85–95%, coconut water and
  electrolytes count a little extra), caffeine tracking, suggested pace until 10 pm, 7-day chart and goal streak.
- **Personal water goal**: 35 ml/kg plus activity, climate and AC-hours adjustments (or set your own).
- **Skin estimates** from hydration, 7-day consistency, sipping spread, sleep, indoor air and today's plate:
  skin hydration index, surface moisture (Corneometer AU scale), trans-epidermal water loss (g/m²/h),
  elasticity, barrier strength, radiance and puffiness risk, with daily care tips.
- **Mess menu editor**: Mon–Sun breakfast, evening snacks and dinner, with 55+ Indian hostel foods,
  serving steppers and custom items. Non-vegan items (paneer, curd, kadhi, milk tea, butter naan) are flagged
  and left out of your totals unless you tick them.
- **Muesli lunch**: one editable recipe used every day (muesli, fortified soy milk, banana, chia, walnuts by default).
- **Nutrient status** vs ICMR-NIN 2020 adult targets: energy, protein, fibre, iron, calcium, zinc, vitamin C,
  B12, omega-3 ALA, potassium, sodium. Today's plate or a whole-menu weekly average.
- **Vegan watchlist** for B12, vitamin D, iron, omega-3, calcium and iodine, plus food suggestions for gaps.
- All data stays on the device (localStorage). Works offline after first load.

Skin numbers are wellness estimates to show trends. They are not a skin test or medical advice.

## Install on your iPad

1. Host the `seep-hydration` folder on any HTTPS host. The easiest: in GitHub go to
   **Settings → Pages**, pick this branch and the root folder, then open
   `https://<your-username>.github.io/<repo>/seep-hydration/`.
2. Open that link in **Safari** on the iPad.
3. Tap **Share → Add to Home Screen**. Seep then opens full screen like a native app.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The app (open this) |
| `app.html` | Same app without the page wrapper, used for the claude.ai preview |
| `manifest.webmanifest`, `icon.svg` | Home-screen install name and icon |
| `sw.js` | Offline cache |
