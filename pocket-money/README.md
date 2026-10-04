# Pocket Money

A private, PIN-locked personal expense tracker that runs entirely in your browser.

## How to open it
- **Online:** https://claude.ai/artifact/95vQEqtzhtf4zVF3YzifZv. Sign in to Claude and the data syncs privately across your devices.
- **Offline:** open `index.html` in any modern browser. Keep `index.html`, `styles.css` and `app.js` together in the same folder. In this mode, data is saved only in that browser.

Unlock with your 4-digit PIN.

## Features
- **PIN lock**: 5 wrong tries locks the screen for 30 seconds, with a countdown. Tapping Unlock before all 4 digits are entered no longer counts as a wrong try. The app locks itself after 5 minutes of inactivity, and the **Lock** button locks it right away.
- **Add expenses** with an amount, a category (Food & Snacks, Stationery & Books, Transport, Shopping & Articles, Entertainment, Mobile & Internet, Gifts & Treats, Health, Other), a date and a note.
- **Budget & savings** on the Overview: your monthly budget, what you spent, what is unspent, how much you can still spend, expected savings, progress toward your savings goal, and savings for each of the last 6 months.
- **Overview** for this week or this month: what you spent, how much is left, a safe amount to spend per day, a projected total, a category breakdown, a daily chart and the last 6 months.
- **Insights & savings plan**: warnings when you are on track to overspend, categories that grew compared with last month, small buys that add up, extra weekend spending, and how much to cut in each category, with a new weekly limit.
- **Settings**: monthly pocket money (budget), savings goal, currency, and backup and restore.

## Privacy notes
- Online, your expenses are saved to a private per-user store on your Claude account. Nobody else who opens the link can read them, not even someone you share the page with.
- Offline, your data is saved only in that browser on that device (localStorage).
- The PIN is checked inside the browser. It keeps people out of the app on your device, but it is not bank-grade security: someone with technical skills and access to your device could still read the stored data.
- Clearing your browser data deletes your expenses. Use **Settings → Download backup** from time to time.
