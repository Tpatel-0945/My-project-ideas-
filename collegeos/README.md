# CollegeOS

A black, spacious study platform for **first-year** PDEU B.Tech students, built on the
PDEU curriculum handbook 2024–28 (`../btech-ce-syllabus-2025.pdf`). Bloom's six levels
(Remember → Create) form the colour spectrum used for every tag, chart and bar, over a
slowly floating knowledge-graph background.

| File | What it is |
| --- | --- |
| `index.html` | The whole app in one page |
| `app.html` | Same page without the HTML wrapper (used for the hosted preview) |
| `server/` | Node.js backend: email one-time-code sign-in, and serves `index.html` |

## Run it with real email codes

```bash
cd collegeos/server
npm install
cp .env.example .env      # then fill it in (see below)
npm start                 # open http://localhost:8787
```

### Gmail setup (one time)
1. Use a Gmail account for sending (e.g. a new `collegeos.signin@gmail.com`).
2. Turn on **2-Step Verification** for it.
3. Create an **App Password** at https://myaccount.google.com/apppasswords.
4. Put the account in `GMAIL_USER` and the 16-character app password in `GMAIL_APP_PASSWORD`.
5. Set `OTP_SECRET` to a long random string:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Without Gmail settings the server still runs, but prints each code in the terminal
instead of emailing it. That's handy for development.

### How sign-in works
1. The student enters their roll-number email, e.g. `26bcp160@sot.pdpu.ac.in`
   (faculty use `name@sot.pdpu.ac.in`). Anything else is rejected on both the page and the server.
2. `POST /api/otp/request` makes a 6-digit code with `crypto.randomInt`, stores only an
   HMAC of it, and emails it (see `server/email-preview.png` for how it looks in Gmail).
3. `POST /api/otp/verify` checks it. Codes expire after 5 minutes, work once, and are
   burned after 5 wrong tries. Resend waits 30 s; max 5 codes per email per hour; per-IP limits too.
4. On success the server returns a signed session token, and the student fills in name,
   branch and semester. Roll number, branch (for `bcp`) and semester are read from the email.

Run the backend tests with `npm test`.

### Hosted preview
The published preview can't reach a server, so it switches to **preview mode** and shows the
code on screen. Everything else works the same.

To put it online for real, deploy `collegeos/` (with `server/`) to any Node host such as
Render or Railway, set the same environment variables there, and set `TRUST_PROXY=1`.

## What's inside
- **Students:** Home, Academics, Attendance, Leave planner, Library, Surveys, Opportunities, Insights.
- **Library:** all 15 first-year courses (Semester I and II). Each has a syllabus map with
  every unit and topic, a Bloom-levelled worksheet with answers, and revision notes. Search works across every topic.
  Indian Knowledge System has no course page in the handbook, so it isn't included yet.
- **Faculty:** class concept heatmap, paper balance checker, early warning, and topic surveys
  with a Reteach / Quick recap / Move on verdict.

Marks, attendance and classmates' survey answers are sample data. App data is saved in the browser (localStorage).
