# 🎯 EndSem Focus — personal end-sem study planner

A PIN-locked website that gives you **daily study goals** for
**Physics, Maths, Computer Programming, IKS, OB, UHV and Environmental Science**,
planned strategically from your syllabus and your end-sem exam dates.

**PIN: `0945`**

## Features
- 🔒 **PIN lock** (0945) with on-screen keypad; 5 wrong tries → 30 s lockout. Stays unlocked until the tab is closed; 🔒 button locks instantly.
- 📝 **Daily digital to-do list** — auto-planned topics + your own tasks (add/delete, tick off).
- 💬 **Thought of the day** — a new motivational quote every day.
- 🔥 **Streak meter** — a day counts when ≥ 60 % of its tasks are done (configurable); current & best streak, next badge, last-7-days strip, 12-week consistency calendar.
- 🧭 **Strategic planner**
  - topics left ÷ study days left (before the revision window) = topics needed per day, per subject;
  - subjects that are behind, high priority, or untouched for a few days are picked first, so every subject keeps moving;
  - unfinished topics automatically carry over (marked "↻ carried over");
  - last 7 days (configurable) before each exam → unit revision + previous-year papers; day before → final revision; exam-day card;
  - spaced-repetition "quick recall" of topics finished 1, 3, 7 and 14 days ago;
  - warns you if you are behind schedule.
- 🗓️ **Plan tab** — per-subject strategy table + preview of the next 7 days.
- 📚 **Syllabus editor** — paste your university syllabus per subject; "✨ Smart format" splits pasted paragraphs into topics. Separate exam date, priority and study style per subject.
- 📈 Progress per subject, history, light/dark mode, backup export/import, works offline, phone friendly.

## Use it
Open `index.html` in any browser — no install, no internet needed.

To use it on your phone from anywhere, publish it with **GitHub Pages**:
repo **Settings → Pages → Deploy from a branch →** pick the branch and `/ (root)` → Save.
The site appears at `https://<your-username>.github.io/My-project-ideas-/`.

## Your syllabus format
```
# Unit 1: Quantum Mechanics
Dual nature of matter & de Broglie hypothesis
Heisenberg uncertainty principle
# Unit 2: Lasers
...
```
One topic per line; a line starting with `#` (or `Unit 1 …`) starts a new unit.

## Notes
- Data is stored only in your browser (localStorage). Use **Settings → Export backup** to move it to another device.
- The PIN is a privacy lock for a static site, not bank-grade security (anyone who reads the page source can find it).
