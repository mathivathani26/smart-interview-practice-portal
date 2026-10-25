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

Add the practice companies, questions, assignments, and drives:
```
npm run seed
```
This additive, repeat-safe seed does not delete or replace existing data and does not create user accounts. It adds missing data for Amazon, Wipro, TCS, Infosys, Accenture, and Cognizant, including questions, company assignments, and one published practice drive per company. Register an account through the regular login form; create an Admin account separately.

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

## 3. Try it out

- Sign in with an existing account or register a student account through the regular login form.
- **Forgot password?** opens recovery. In development without SMTP, the page provides a local testing link; reset tokens expire after 30 minutes and work once. With SMTP configured, the link is delivered by email instead.
- **Mock Drive** → pick TCS (or any company) → go through Aptitude → Coding → Theory in one sitting → see the full round-by-round report.
- **Single Practice** → pick a subject → answer one typed question, scored by the same Jaccard/TF-IDF engine.
- **Leaderboard** → switch companies to see ranked scores (populates as more sessions complete).
- **History** → every past session, both mock drives and single-question practice.
- **Admin** → sign in with an account that has the Admin role → manage question banks and configure each company's enabled rounds, counts, durations, topics, and difficulty distribution.

## The Coding round: how code actually gets evaluated

Submitted code is evaluated for real, using one of three methods, tried in this order:

1. **Real Judge0 API** — if you set `RAPIDAPI_KEY` in `.env`, every language runs on Judge0's real compilers/interpreters.
2. **Real local execution** (development only, no setup needed) — when `RAPIDAPI_KEY` is absent and `NODE_ENV` is not `production`, the backend can run submitted code directly using supported local interpreters.

In production, code submissions are sent to Judge0 only when `RAPIDAPI_KEY` is configured. If neither Judge0 nor a supported local interpreter is available, the request fails explicitly and no score is saved; the backend never invents simulated test results.
Compilation errors are recorded as zero-score test results with their verdicts. If the execution service itself fails, the API returns an error and does not save a score.

### A safety note on real local execution

Running submitted code directly on the development machine is intended only for local practice. It is **not** a sandboxed, multi-tenant judge. Public deployments must use Judge0 for code execution; the production-mode guard disables code execution when Judge0 is not configured rather than falling back to local execution.

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
2. **Local execution** — if no Judge0 key, the backend runs the code for real, directly on your machine (`backend/utils/localRunner.js`):
   - **Python** — via a local `python3`/`python` interpreter
   - **JavaScript** — via the same Node.js process already running the server
   - **C++** — compiled with `g++` and executed as a real binary
   - **Java** — run via the JDK 11+ single-file source launcher (`java Main.java`), so no separate compile step is needed
3. **Unavailable** — if a language's compiler/interpreter is not installed and no Judge0 key is configured, execution fails explicitly and no score is awarded.

This is genuine execution, not simulation: wrong code fails and correct code passes when a compatible local interpreter/compiler or Judge0 is configured.

**Per-language starter code:** the editor uses a question-specific `starter_code` template where one exists and falls back to the language template otherwise. Switching language preserves the student's draft for each language on that question.

**Java note:** every Java template (and any Java code an admin adds later) must declare `public class Main` — the single-file launcher requires the file name to match the public class name, and the backend always writes it to `Main.java`.

**System requirements for local execution without Judge0:** Python 3 is required for Python; Node.js runs JavaScript; C++ requires `g++`; Java requires a JDK 11+; C requires a configured Judge0 key. If an interpreter/compiler is unavailable, execution fails clearly and no score is saved.

**Safety note:** local execution runs submitted code directly on your machine with a 5-second timeout. This is intended for single-user local practice (you running your own code on your own computer), not a sandboxed, multi-tenant-safe judge — don't expose this backend on a shared or public server without adding real sandboxing (containers, resource limits, etc.).

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

Use **Admin → Company Patterns** to create a company and configure or edit its rounds. The authenticated admin API remains available:

- `GET /api/admin/companies` — list companies and their saved settings.
- `POST /api/admin/companies` — create a company.
- `PUT /api/admin/companies/:id/pattern` — validate and save its round configuration.
- `DELETE /api/admin/companies/:id` — delete a company and its pattern.

Round configuration is stored in `CompanyPattern.round_sequence`. Counts must be non-negative integers, enabled rounds need a positive count, durations must be positive, and a configured difficulty distribution must total 100%. Topic filters use aptitude categories, coding tags, or theory subjects. When a student starts a drive, the backend validates eligibility and stores a fixed, randomized set of question IDs and the active configuration on the new `Session`; if the pool cannot satisfy the configuration, the drive is rejected with an explanatory message before a session is created. Existing saved patterns without the new optional fields continue to work. A company with no pattern must be configured by an admin before a drive can start.

Marks per question, negative marking, and per-round passing thresholds are not exposed because the current scoring and result models do not support those behaviors; existing scoring remains unchanged.

## Adding more questions

Either use the Admin panel (Aptitude/Coding/Theory tabs → "+ Add Question"), or edit `backend/seed/seed.js` and re-run `npm run seed` (note: this **replaces** all existing questions — remove the `deleteMany` calls at the top if you want it to add instead of reset).

## Troubleshooting

- **"Failed to fetch" in the browser** → backend isn't running, or isn't on port 5000.
- **CORS errors in the console** → make sure you're opening the frontend via Live Server (`http://127.0.0.1:5500`), not `file://`.
- **"No more questions available for this selection"** → that question bank + category + difficulty combination is empty; add more questions via Admin, or pick a different combination.
- **Coding execution is unavailable** → configure `RAPIDAPI_KEY` for Judge0, or install a supported local interpreter/compiler for development. Submissions are not simulated when execution is unavailable.
- **Can't reach Admin panel** → you're logged in as the demo student, not the admin. Log out and log back in with `admin@smartinterview.local` / `Admin@1234`.
