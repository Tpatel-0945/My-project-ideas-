# AURA//LAB — Skin & Hair Intelligence

A futuristic, personal skin & hair website tuned for Indian weather. Plain HTML/CSS/JS — no build step, no backend.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

To host it free, enable **GitHub Pages** (Settings → Pages → deploy from branch, root folder).

## What's inside

| Area | Features |
|---|---|
| Core | Home (tagline, featured products & bundles), Skin (acne, pigmentation, dryness, oily, anti-aging, sun care), Hair (hair fall, dandruff, frizz, scalp, growth, styling), About, Contact, FAQ |
| Personalization | Skin & hair type quizzes → type + routine · Routine builder (AM/PM, reorder, templates, live conflict detection) · Ingredient checker (31 actives) · Compatibility checker · Climate tips (live UV/humidity via Open-Meteo + simulator) |
| Content | Articles (myths vs facts, beginner, budget, monsoon) · DIY remedies with evidence labels · Step-by-step video tutorials · Glossary |
| Store | Filters (type, concern, budget, vegan, fragrance-free) · Reviews by skin type · Cart, wishlist, checkout (UPI / Razorpay / COD — demo) · Bundles |
| Clinic | Services & prices · Calendar + slot booking · Expert profiles · Before/after slider (consent labelled) · Online consultation form |
| Tech | On-device AI skin scan (shine, redness, spots, tone) · Rule-based chatbot · Progress tracker with photo compare & trend chart · Reminders (notifications + `.ics` calendar export) · Local account with export/import/delete |
| Trust | Disclaimer strip & page · "See a dermatologist if…" boxes · Red-flag detection in chat & consult form · Privacy policy |

All user data lives in `localStorage` (`aura.*` keys). Photos never leave the device.

## Files

- `index.html` — shell, nav, footer, chat widget
- `css/style.css` — theme (dark, neon gradients, glassmorphism)
- `js/data.js` — all content: concerns, ingredients, mixing rules, quizzes, products, articles, remedies, glossary, services
- `js/app.js` — router, pages and features

Edit `js/data.js` to change products, prices, experts or content.

## Extending

- **Real CNN skin model:** set `App.scan.model = async (canvas) => ({ shine, redness, spots, evenness })`, e.g. with a TensorFlow.js model or a call to your API. Its scores override the heuristic ones.
- **Real payments:** in `placeOrder` (`js/app.js`), create an order on your server and open [Razorpay Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/) with your key. Never put secret keys in front-end code.
- **LLM chatbot:** replace `chatAnswer()` with a call to your own backend that proxies an LLM API. Keep the red-flag check in front of it.
- **Real accounts:** swap the `store` helper for Firebase/Supabase auth + database.

> Sample reviews, expert profiles and before/after visuals are placeholders. Replace them with real, consented data before going public. Nothing here is medical advice.
