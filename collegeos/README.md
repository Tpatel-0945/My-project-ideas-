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

## Getting the code in Gmail

**The hosted preview link can never send email.** It runs in a sandbox with no server, so it
always shows the code on screen. To receive real codes in Gmail, run the CollegeOS server
(option A or B below) and open the app **from the server's address**.

### A. On your laptop with Gmail (about 5 minutes)
1. Pick a Gmail account to send from. Turn on 2-Step Verification:
   https://myaccount.google.com/signinoptions/twosv
2. Create an App Password at https://myaccount.google.com/apppasswords and copy the 16 letters.
3. Set it up and start the server:
   ```bash
   cd collegeos/server
   npm install
   cp .env.example .env        # on Windows: copy .env.example .env
   # edit .env: GMAIL_USER=your@gmail.com and GMAIL_APP_PASSWORD=the 16 letters
   npm run check-mail -- 26bcp160@sot.pdpu.ac.in   # sends a test email and tells you what's wrong if it fails
   npm start
   ```
4. Open **http://localhost:8787**, enter your college email, and the code arrives in Gmail.

When the server starts it prints `✓ Email ready` or exactly why email isn't working
(wrong App Password, blocked network, and so on). The sign-in page shows the same status.

### B. Online for everyone (Render, free)
Render's free plan blocks Gmail's mail ports, so online hosting uses **Brevo** (free, 300 emails a day, sent over HTTPS).
1. Sign up at https://www.brevo.com. Under **Senders**, add and verify the address you'll send from.
   Under **SMTP & API → API keys**, create a key.
2. On https://render.com choose **New → Blueprint**, pick this GitHub repo (it reads `render.yaml`),
   and paste `BREVO_API_KEY` and `MAIL_FROM_EMAIL` when asked.
3. Open the `onrender.com` link Render gives you. Share that link with students.

### If the code doesn't arrive
- Look in **Spam** and **Promotions**. College Google Workspace inboxes sometimes filter
  mail from new senders; mark the first one "Not spam".
- Run `npm run check-mail -- your@sot.pdpu.ac.in` and read the message.
- Make sure you opened the app from `localhost:8787` or your Render link, not the preview link.

### How sign-in works
1. The student enters their roll-number email, e.g. `26bcp160@sot.pdpu.ac.in`
   (faculty use `name@sot.pdpu.ac.in`). Anything else is rejected on the page and on the server.
2. `POST /api/otp/request` makes a 6-digit code with `crypto.randomInt`, stores only an HMAC of it,
   and emails it (see `server/email-preview.png`).
3. `POST /api/otp/verify` checks it. Codes expire after 5 minutes, work once and are burned after
   5 wrong tries. Resend waits 30 s; at most 5 codes per email per hour, plus per-IP limits.
4. On success the server returns a signed session token. Roll number, branch (for `bcp`) and
   semester are read from the email.

Run the backend tests with `npm test`.

## What's inside
- **Students:** Home, Academics, Attendance, Leave planner, Library, Surveys, Opportunities, Insights.
- **Library:** all 15 first-year courses (Semester I and II). Each has a syllabus map with
  every unit and topic, a Bloom-levelled worksheet with answers, and revision notes. Search works across every topic.
  Indian Knowledge System has no course page in the handbook, so it isn't included yet.
- **Faculty:** class concept heatmap, paper balance checker, early warning, and topic surveys
  with a Reteach / Quick recap / Move on verdict.

Marks, attendance and classmates' survey answers are sample data. App data is saved in the browser (localStorage).
