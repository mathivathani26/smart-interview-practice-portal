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
3. **Simulated (development only)** — unsupported languages without a local interpreter and without a Judge0 key use a simulated result, clearly labeled in the UI.

In production, code submissions are sent to Judge0 only when `RAPIDAPI_KEY` is configured. If the key is absent, the code-run endpoint returns an unavailable response; it never runs submitted code locally or uses simulated results.
Compilation errors are recorded as zero-score test results with their verdicts. If the execution service itself fails, the API returns an error and does not save a score.

### A safety note on real local execution

Running submitted code directly on the development machine is intended only for local practice. It is **not** a sandboxed, multi-tenant judge. Public deployments must use Judge0 for code execution; the production-mode guard disables code execution when Judge0 is not configured rather than falling back to local execution.

**To enable real code execution:**
1. Get a free key at [rapidapi.com/judge0-official/api/judge0-ce](https://rapidapi.com/judge0-official/api/judge0-ce)
2. Add it to `backend/.env`: `RAPIDAPI_KEY=your_key_here`
3. Restart the backend (`npm start`)

Submitted code now actually compiles and runs against each test case's real stdin/stdout via Judge0.

## What's real vs. what's a placeholder

| Feature | Status |
|---|---|
| Register / Login (JWT + bcrypt) | Fully real |
| Theory scoring (Jaccard + TF-IDF) | Fully real, runs in Node, no external API |
| Aptitude scoring | Fully real (instant, exact-match) |
| Coding scoring | Local execution is for development only; production requires Judge0 via `RAPIDAPI_KEY` |
| **Coding: real verdict types (Accepted/Wrong Answer/Runtime Error/Compilation Error/TLE), time** | Real for all 4 languages via local execution; memory usage is only reported when using Judge0 |
| **Coding: per-language starter code** | Each of the 9 seeded problems has a distinct, verified starter template for Python, JavaScript, C++, and Java — switching the language dropdown actually swaps the code shown, not just the syntax highlighting |
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
3. **Simulated mock** — only reached if a language's compiler/interpreter genuinely isn't installed on your machine (e.g. no `g++`, no JDK) and no Judge0 key is configured. Clearly labeled with a "Mock judge" badge in the UI.

This is genuine execution, not simulation: wrong code fails, correct code passes, entirely offline for every language.

**Per-language starter code:** each of the 9 seeded coding questions carries a separate, independently-verified starter template per language (`starter_code: { python3, javascript, cpp, java }` on the `CodingQuestion` model), each with the stdin-reading/output-printing boilerplate already wired up — a student only needs to fill in the actual logic. Switching the language dropdown mid-question swaps in that language's template; if you'd already started typing in the language you're leaving, it's remembered and restored if you switch back.

**Java note:** every Java template (and any Java code an admin adds later) must declare `public class Main` — the single-file launcher requires the file name to match the public class name, and the backend always writes it to `Main.java`.

**System requirements for full local execution:** Python and JavaScript need nothing extra (Node is already running your server; Python 3 is commonly pre-installed, especially on Mac/Linux). C++ needs `g++` on your PATH, and Java needs a JDK 11+ (for the single-file launcher). If a compiler/interpreter isn't found, that specific language falls back to the simulated mock automatically — nothing crashes, but check your backend terminal's startup output if a language isn't executing for real when you expect it to.

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
- **Coding round result doesn't match what you expected** → check the "Simulated results" badge on the results panel. If it's showing, neither Python nor a Judge0 key was available for that language — install Python 3 (`python3 --version` to check) or add `RAPIDAPI_KEY` for real execution. If the badge is NOT showing, the result reflects genuine execution of your code.
- **Can't reach Admin panel** → you're logged in as the demo student, not the admin. Log out and log back in with `admin@smartinterview.local` / `Admin@1234`.
