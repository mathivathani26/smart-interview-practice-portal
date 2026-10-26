# Smart Interview Practice Portal — Full Stack (v2)

Complete working system: Node.js/Express/MongoDB backend + the multi-round
frontend (Aptitude, Coding, Theory rounds combined into a Mock Drive, plus
single-question practice, leaderboard, history, and an admin panel).

```
smart-interview-fullstack/
├── backend/     ← Express + MongoDB API
└── frontend/    ← HTML/CSS/vanilla JS, calls the backend directly
```

## 1. Set up the backend

You already have MongoDB installed locally, so:

```
cd backend
npm install
copy .env.example .env        (Mac/Linux: cp .env.example .env)
```

Open `.env`:
- Set `MONGO_URI` to your MongoDB connection string. The backend does not fall back to a guessed local database.
- Set `JWT_SECRET` to any random string, e.g. `JWT_SECRET=mySecretKey123`.
- Keep `NODE_ENV=development` for local development. Without SMTP, password recovery displays a development-only reset link in the recovery page.
- To send real recovery emails, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in `backend/.env`. Set `FRONTEND_URL` to the origin serving the frontend (for example `http://localhost:5500`). Never commit SMTP credentials. In production, configure SMTP and set `NODE_ENV=production`; reset tokens are never returned in production responses or logs.
- For production code execution, configure `RAPIDAPI_KEY` for Judge0 (see "The Coding round" below). Never commit this key.

Add the practice companies, questions, assignments, and missing company drive configurations:
```
npm run seed
```
This additive, repeat-safe seed does not delete or replace existing data and does not create user accounts. It adds missing data for Amazon, Wipro, TCS, Infosys, Accenture, and Cognizant, including questions, company assignments, and one count-based company drive configuration when none exists. Legacy drive records are retained and are not duplicated. Register an account through the regular login form; create an Admin account separately.

Start the backend:
```
npm start
```
You should see `MongoDB connected` and `Server running on http://localhost:5000`. Leave this terminal running.

## 2. Run the frontend

Open the `frontend` folder in VS Code and use **Live Server** on `index.html`, same as before. When served from `localhost` or `127.0.0.1`, the frontend automatically uses the backend at `http://localhost:5000/api`; on the deployed site it uses the configured Render API. Keep the backend terminal running alongside it.

Run the backend checks from `backend` with:
```
npm test
```

### Checking stale company question assignments

From `backend`, run `node scripts/repairCompanyQuestionAssignments.js` for a
read-only diagnosis of missing Coding Question assignment references. The
report includes the company, affected assignment record IDs, active coding
round rules, eligible replacements, and any unresolved per-difficulty
shortages. It does not change records.

Only after reviewing and approving that exact report, run the same script with
`--apply`. It rechecks the database in a transaction, backs up each affected
assignment record in `companyquestionassignmentrepairbackups`, and then
replaces a stale reference only with a distinct question from the Coding
Question bank that satisfies the company's configured difficulty and tags.
When an obsolete row is not needed and there is no shortage, the script removes
that row after backing it up. Unresolved shortages and duplicate rows are left
untouched. Apply mode requires MongoDB transaction support and aborts if the
diagnosis changed after review. Re-running either mode is safe.

## 3. Try it out

- Sign in with an existing account or register a student account through the regular login form.
- **Forgot password?** opens recovery. In development without SMTP, the page provides a local testing link; reset tokens expire after 30 minutes and work once. With SMTP configured, the link is delivered by email instead.
- **Mock Drive** → pick TCS (or any company) → go through Aptitude → Coding → Theory in one sitting → see the full round-by-round report.
- **Single Practice** → pick a subject → answer one typed question, scored by the same Jaccard/TF-IDF engine.
- **Leaderboard** → switch companies to see ranked scores (populates as more sessions complete).
- **History** → every past session, both mock drives and single-question practice.
- **Admin** → sign in with an account that has the Admin role → manage question banks and configure each company's single drive, round counts, durations, topics, and per-difficulty question counts.

## The Coding round: how code actually gets evaluated

Submitted code is evaluated for real, using one of three methods, tried in this order:

1. **Real Judge0 API** — if you set `RAPIDAPI_KEY` in `.env`, every language runs on Judge0's real compilers/interpreters.
2. **Real local execution** (development only, no setup needed) — when `RAPIDAPI_KEY` is absent and `NODE_ENV=development`, the backend can run submitted code directly using supported local interpreters.

Outside explicit development mode, code submissions are sent to Judge0 only when `RAPIDAPI_KEY` is configured. If neither Judge0 nor a supported local interpreter is available, the request fails explicitly and no score is saved; the backend never invents simulated test results.
Compilation errors are recorded as zero-score test results with their verdicts. If the execution service itself fails, the API returns an error and does not save a score.

### A safety note on real local execution

Running submitted code directly on the development machine is intended only for local practice. It is **not** a sandboxed, multi-tenant judge. Local execution is enabled only when `NODE_ENV=development`; public deployments must use Judge0, and any other mode disables code execution when Judge0 is not configured rather than falling back to local execution.

**To enable real code execution:**
1. Create a RapidAPI account, subscribe to the existing [Judge0 CE API](https://rapidapi.com/judge0-official/api/judge0-ce), and obtain its key.
2. Locally, set `RAPIDAPI_KEY` in `backend/.env`. On Render, add `RAPIDAPI_KEY` to the **backend Web Service's Environment** settings. Do not put it in frontend variables or Git.
3. Restart the local backend or redeploy the Render backend after saving the variable.

The frontend supports **Python 3** (Judge0 71), **C** (50), **C++** (54), **Java** (62), and **JavaScript/Node.js** (63). Each language has a non-solution starter template when a question has no language-specific template. Existing question-specific templates are retained. Switching languages keeps the edited source per language for that question; **Restore Starter Code** asks before replacing non-empty edits. Run Code displays visible test-case output, while hidden tests remain hidden until scored.

## What's real vs. what's a placeholder

| Feature | Status |
|---|---|
| Register / Login (JWT + bcrypt) | Fully real |
| Theory scoring (Jaccard + TF-IDF) | Fully real, runs in Node, no external API |
| Aptitude scoring | Fully real (instant, exact-match) |
| Coding scoring | Local execution is for development only; production requires Judge0 via `RAPIDAPI_KEY` |
| **Coding: real verdict types (Accepted/Wrong Answer/Runtime Error/Compilation Error/TLE), time** | Real for configured provider execution; memory usage is only reported when using Judge0 |
| **Coding: per-language starter code** | Question-specific templates are used when present; otherwise safe, editable input/entry-point templates are provided for Python 3, C, C++, Java, and JavaScript |
| **Coding: paste detection** | Fully real — listens for paste events on the code editor, logs a count per submission |
| **Coding: approach-tag feedback** | Heuristic keyword/pattern detection (see note below) — not full static analysis |
| **Coding: Monaco Editor** (syntax highlighting, line numbers) | Fully real, loaded from CDN; falls back to a plain textarea automatically if there's no internet |
| Code similarity / plagiarism check | Fully real (Jaccard over submitted code tokens) |
| Dashboard stats, trend, weak subjects | Fully real, aggregated from your actual sessions |
| Leaderboard | Fully real, aggregated from all completed sessions per company |
| Tab-switch proctoring | Fully real (Page Visibility API), logged per round |
| Admin question-bank CRUD | Fully real — coding questions now take a separate starter-code field per language |
| Admin company mock-drive settings | Fully editable in the Admin panel; settings persist in `CompanyPattern` documents and are snapshotted with assigned question IDs per drive session |
| PDF report | Uses the browser's print dialog on a hidden printable sheet — a reasonable stand-in for a generated PDF file |

### How the Coding round actually decides what to run (in order)

1. **Judge0** — if `RAPIDAPI_KEY` is set in `.env`, every language goes through the real Judge0 API.
2. **Local execution** — only when `NODE_ENV=development` and no Judge0 key is configured, the backend runs code directly on your machine (`backend/utils/localRunner.js`):
   - **Python** — via a local `python3`/`python` interpreter
   - **JavaScript** — via the same Node.js process already running the server
   - **C++** — compiled with `g++` and executed as a real binary
   - **Java** — run via the JDK 11+ single-file source launcher (`java Main.java`), so no separate compile step is needed
3. **Unavailable** — if a language's compiler/interpreter is not installed and no Judge0 key is configured, execution fails explicitly and no score is awarded.

This is genuine execution, not simulation: wrong code fails and correct code passes when a compatible local interpreter/compiler or Judge0 is configured.

**Per-language starter code:** the editor uses a question-specific `starter_code` template where one exists and falls back to the language template otherwise. Switching language preserves the student's draft for each language on that question.

**Java note:** every Java template (and any Java code an admin adds later) must declare `public class Main` — the single-file launcher requires the file name to match the public class name, and the backend always writes it to `Main.java`.

**System requirements for local execution without Judge0:** Python 3 is required for Python; Node.js runs JavaScript; C++ requires `g++`; Java requires a JDK 11+; C requires a configured Judge0 key. If an interpreter/compiler is unavailable, execution fails clearly and no score is saved.

**Safety note:** local execution runs submitted code directly on your machine with a 5-second timeout. It is enabled only with `NODE_ENV=development` and is intended for single-user local practice (you running your own code on your own computer), not a sandboxed, multi-tenant-safe judge — don't expose this backend on a shared or public server without adding real sandboxing (containers, resource limits, etc.).

### A note on approach-tag detection

`backend/utils/approachDetector.js` looks for surface-level keyword/pattern
signals in submitted code (e.g., does it use a dict/hash map, does it have
a `dp[]` array, does it use two nested loops suggesting brute force) and
compares that against the question's technique tags. This is a **heuristic**,
not a real static-analysis engine or AST parser — it's honest, useful
feedback, but it can occasionally miss a technique that was used in an
unusual way, or credit one that happens to match a keyword coincidentally.
That's worth stating plainly if asked about it in a review.

### Monaco Editor and offline use

The code editor is loaded from a CDN (`cdnjs.cloudflare.com`), so it needs
internet the first time a page loads it. If there's no internet, the page
automatically falls back to a plain `<textarea>` — the Coding round still
works completely, just without syntax highlighting.


## Company mock-drive settings

Use **Admin → Company Patterns** to create a company and configure or edit its one General Practice Drive. New settings are saved on the company pattern; independent drive creation and publishing are no longer available. Legacy `MockDrive` records remain in the database for existing sessions and history.

- `GET /api/admin/companies` — list companies and their saved settings.
- `POST /api/admin/companies` — create a company.
- `PUT /api/admin/companies/:id/pattern` — validate and save its round configuration.
- `DELETE /api/admin/companies/:id` — delete a company and its pattern.

Round configuration is stored in `CompanyPattern.round_sequence`. Easy, Medium, and Hard counts must each be non-negative integers and total exactly to the configured number of questions. Enabled rounds need a positive total, durations must be positive, and each configured difficulty pool must contain enough eligible questions before the settings can be saved. Topic filters use aptitude categories, coding tags, or theory subjects; multiple coding tags use OR matching after normalizing case, whitespace, and common plurals.

Older percentage-based settings are not treated as question counts in storage. The Admin panel displays a deterministic suggested count conversion for complete percentage distributions and clearly marks legacy settings; an administrator must review and explicitly save the counts before they become the canonical configuration. Legacy duplicate drive records are not deleted: when a company has no canonical pattern, the oldest published legacy configuration is used, with only one configuration exposed to students. A saved company pattern takes precedence. Starting a drive validates eligibility and snapshots a fixed, randomized set of question IDs and the active count-based configuration in the new `Session`. If any required pool is insufficient, the start is rejected with an explanatory message before a session is created. Historical session records remain unchanged.

Marks per question, negative marking, and per-round passing thresholds are not exposed because the current scoring and result models do not support those behaviors; existing scoring remains unchanged.

## Adding more questions

Either use the Admin panel (Aptitude/Coding/Theory tabs → "+ Add Question"), or edit `backend/seed/seed.js` and re-run `npm run seed` (note: this **replaces** all existing questions — remove the `deleteMany` calls at the top if you want it to add instead of reset).

## Troubleshooting

- **"Failed to fetch" in the browser** → backend isn't running, or isn't on port 5000.
- **CORS errors in the console** → make sure you're opening the frontend via Live Server (`http://127.0.0.1:5500`), not `file://`.
- **"No more questions available for this selection"** → that question bank + category + difficulty combination is empty; add more questions via Admin, or pick a different combination.
- **Coding execution is unavailable** → configure `RAPIDAPI_KEY` for Judge0, or install a supported local interpreter/compiler for development. Submissions are not simulated when execution is unavailable.
- **Can't reach Admin panel** → you're logged in as the demo student, not the admin. Log out and log back in with `admin@smartinterview.local` / `Admin@1234`.
