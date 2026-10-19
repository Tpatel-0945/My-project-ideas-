# CollegeOS prototype

Interactive, single-file prototype of CollegeOS with a black interface.
Open `index.html` in any browser. No build step. `app.html` is the same page without the HTML wrapper.

Bloom's six levels (Remember → Create) form a colour spectrum used for every tag, chart and bar.
Subjects, course codes, units and the exam scheme (MS 25 · IA 25 · ES 50) follow the
PDEU B.Tech Computer Engineering syllabus 2024–28, Semester III (`../btech-ce-syllabus-2025.pdf`).

## Sign in
1. College email (must end in `pdpu.ac.in` or `pdeu.ac.in`), as student or faculty.
2. 6-digit one-time code (demo build shows the code on screen; no email is sent).
3. Profile: full name + branch + semester (students) or department (faculty).

## Student
- **Home**: survey banner, semester pulse, "fix this first" root cause, timetable, alerts.
- **Academics**: MS+IA and predicted ES marks, what-if SGPA, Bloom-tagged past papers.
- **Attendance**: per-subject table, quick leave calculator, QR scan demo.
- **Leave**: calculator with your own numbers + date-based leave planner and mentor request.
- **Library**: worksheets (answer keys, name/roll auto-filled), mind maps and notes, mapped to syllabus units. Filter by type/subject, search.
- **Surveys**: anonymous topic surveys from faculty (understanding, pace, confidence, concept check, confusing subtopics, comment).
- **Opportunities**, **Insights** (Bloom radar, knowledge-tracing quiz, root-cause tree, study plan).

## Faculty
- **Class insight**: concept heatmap, paper balance checker, early warning.
- **Surveys**: publish a topic survey, then get a Reteach / Quick recap / Move on verdict with a reteach index,
  reasons, a plan for the next class, understanding histogram, confidence-vs-correctness matrix,
  pace split, most confusing subtopics and comment themes with quotes.

Data is saved in the browser (localStorage), so a survey published in the faculty view appears in the
student view on the same device. Classmates' responses, marks and attendance are sample data.
