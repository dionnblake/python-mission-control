# Python Mission Control

A local Windows study game for learning to read and reason through Python in preparation for a basics exam. One learner, no account, no API key, no runtime internet connection.

## Run the Windows application

Open `outputs/Python Mission Control/Python Mission Control.exe` in the portable release folder, or run the installer in `outputs/`. Keep the portable executable beside its `mission-python` folder. The bundled CPython runtime means Python does not need to be installed to study. Microsoft Edge WebView2 Runtime must already be installed; the installer does not download anything.

Resize using any window edge or corner, or use the title-bar maximize/restore button. The initial content size is 1200 by 800 logical pixels; the minimum is 360 by 480. The interface adapts to narrower windows.

Launch the portable release from this repository:

```powershell
& ".\outputs\Python Mission Control\Python Mission Control.exe"
```

From this repository, the development command is:

```powershell
npm start
```

On a fresh source checkout, install dependencies and prepare the bundled Python helper first:

```powershell
npm ci
npm run bundle:python
npm start
```

Source development requires Node.js 22.12+ (tested with 24.16), Rust/MSVC build tools, Python 3.13, and WebView2. Python is a build prerequisite only. `npm run dev` starts the frontend server alone; learning and storage require the Tauri desktop host.

## Build the Windows release

```powershell
npm run build:windows
```

This builds the CPython helper, frontend, optimized Tauri executable and a per-user NSIS installer. The installer is generated at `src-tauri/target/release/bundle/nsis/Python Mission Control_0.1.0_x64-setup.exe`. The app executable is `src-tauri/target/release/python-mission-control.exe`; `mission-python/` is a required adjacent resource directory. Nothing is uploaded, published, or signed by this command.

## Daily use

1. Take the ten-question baseline. Answers and explanations stay hidden until submission.
2. Start today's mission. Standard sessions contain 12 challenges; preferences offer 6 or 20.
3. Predict, optionally mark confidence, then lock the answer. Watch the real Python Machine, examine the turning point, and explain it in your own words.
4. Missed or uncertain questions receive a related variation. Debugging incidents ask for the faulty line, a repair, and a real execution check.
5. Use Flashcards for a short retrieval pass. Recommended cards are due-first and tied to the concepts behind your Training Deck and submitted Mock Exam mistakes.
6. Take a 24-question, 30-minute mixed mock exam. Review answers and topic scores afterward. Closing and reopening preserves its answers and original deadline.

Training attempts are saved as they happen. An unfinished training sequence resumes while the app stays open; after a full restart, completed attempts remain saved and a newly recommended sequence begins. Baselines and exams resume across restarts. While an assessment is active, the other sections remain browseable, the timer continues, and the Resume banner returns to the assessment; starting another mission returns there as well. Optional scratchpad text is temporary.

When the page/code has focus: `1–4` select an answer, `Enter` locks/continues, `H` requests a guided hint. Within Python Machine, `Space` advances and `R` resets. Hold `Ctrl` and use the mouse wheel anywhere in the app to change text size; the setting is saved on this device. Focused buttons retain their native Enter/Space behavior, and editable fields retain ordinary typing. Tab navigation, visible focus, reduced motion, and text scaling are supported.

## What's included

- **232 exercises across 58 concept families**, with four deterministic variations each.
- All 15 challenge types: output prediction, next line, variable value, true condition, function return, bug finding, repair selection, missing line, line ordering, collection state, exception identification, traceback reading, scope, bug-exposing input, and loop count.
- **20 two-stage debugging exercises** and a five-case boss mission.
- **64 retention flashcards** across eight topics, including concept-recall and code-reading cards with deterministic spaced review.
- Variables, numeric types, arithmetic, assignment/reassignment, strings, truthiness, if/elif/else, lists/tuples/dictionaries/sets, indexes/slices/membership, range/for/while, counters/accumulators/break/continue, functions/arguments/returns, scope/default arguments/mutable defaults, mutation/comprehensions, common built-ins, exceptions and try/except/finally.
- Local XP, levels, study-day counts, milestones, topic practice, mock history, adjustable target and exam topic weights.

Content is edited in `src/content/`, not in React components. `defaultWeights` in its index is the default blueprint; preferences override it locally. `src/config.ts` owns the display name and exam dimensions; update the Tauri name too when renaming the packaged application.

## How the Python Machine works

React calls a narrow Tauri command. Rust starts a hidden, bundled CPython helper without a shell and waits off the UI thread. The helper checks the controlled code's AST, instruments supported statements, and uses `sys.settrace` for function calls, returns and exceptions. Python itself performs every operation. Snapshots are taken after statements so the highlighted line agrees with the visible changes.

Events include source line, frame, locals/globals, previous/new values, output, branch decisions, loop iterations, arguments bound to parameters, return values, and a simple call stack. Branch expressions are evaluated once, rather than re-evaluated for display. List/dictionary state is copied for historical snapshots.

Execution is limited by input size, allowed operations, trace steps, recursion, stdout, helper response size, a Python time budget, and a six-second native hard timeout that kills and reaps the helper. The renderer receives no arbitrary filesystem or shell capability. This is controlled lesson execution, not a general-purpose sandbox or code editor.

Implementation references: [CPython tracing documentation](https://docs.python.org/3/library/sys.html#sys.settrace) and [Tauri bundled resources](https://v2.tauri.app/develop/resources/).

## Review and progression

Each concept family tracks attempts, correctness, last eight results, hints, unaided accuracy, time, confidence mistakes, last practice and review due time. Confident errors are due after 10 minutes; other errors after one hour; uncertain correct answers after four hours; assisted correct answers after eight hours. Repeated confident unaided success spaces reviews to 1, 3, 7 and 14 days. Missions reserve up to 40% for due review and balance the remaining topics against the blueprint. Recent variants are avoided when alternatives exist.

Flashcards use the same local progress snapshot. Again returns a card after 10 minutes and keeps it in the current session once; Hard uses a shorter near-term interval; Got It advances through 1, 3, 7, 14 and 30 days. A wrong Training Deck answer or submitted Mock Exam miss promotes only the cards explicitly linked to that challenge, with high-confidence misses receiving the strongest signal. Flashcard ratings guide retention timing but cannot affect mock-exam scoring or readiness claims.

Guided support fades after repeated unaided success on the same concept: light support after at least three of the last four answers are correct without hints; independent practice after at least seven of the last eight, including the latest. Mistakes restore help. Light practice removes pre-answer hints; independent practice also removes the Machine. Assessment modes always hide assistance.

The roadmap uses 32 and 100 unaided correct answers as simple phase markers. Basic practice begins at difficulty 1, adds difficulty 2 after 12 unaided correct answers, and difficulty 3 at 32. These are transparent product rules, not a validated psychological mastery model. Topic labels summarize practiced concepts; mock exams provide broader evidence. No practice score guarantees an employer's result.

## Local data and recovery

Normal progress lives in `%APPDATA%/local.python-mission-control.app/progress.sqlite3`. Every save is a SQLite transaction with full synchronization; the preceding valid JSON snapshot is retained in `snapshots.previous`. Saved content receives structural validation in Rust and semantic validation in TypeScript. Corrupt files, unknown schemas, invalid data and missing-current/preserved-previous states fail visibly rather than reset the learner.

An OS-held `profile.lock` allows only one app instance to access a profile at a time. A second window shows a clear error; close the first and use **Retry connection** to load its latest progress. A leftover marker after a crash does not block startup because ownership depends on the live handle.

Before manual recovery, close the app and preserve the entire database. The `snapshots` table has `current` and `previous` rows. Preferences includes a confirmed **Master reset** that atomically replaces the profile with first-run defaults, clears the recovery snapshot, and cannot be undone. An uninstall or app update should not be used as a recovery procedure.

For isolated testing, a startup-only `PMC_PROFILE_DIR` environment variable can point to an absolute local directory. SQLite is stored directly there and WebView2 state under `webview/main/`. The renderer cannot change this path. The smoke script uses only test-owned folders under `work/desktop-profile/`.

## Verify

```powershell
npm run typecheck
npm run lint
npm test
npm run test:python
npm run test:native
npm run build
node scripts/desktop-smoke.mjs
node "C:\Users\ALPHA\.context\scripts\verify.js" "."
```

The desktop smoke test requires a current release build. It launches the actual executable, drives its WebView2 UI through Playwright/CDP, records screenshots, and verifies native persistence and Python execution. This debugging port exists only in the test subprocess environment. Results go to `outputs/verification/`. The normal baseline, study session, mock exam and debugging checks use real UI actions. Supplemental ordering, scaffold-fading and expired-exam checks use explicitly labeled synthetic saved profiles; the original test-session snapshot is restored and checked afterward.

## Current limits

- Starter curriculum covers foundational and selected fluency material. File I/O, imports/modules, and classes are not in this starter bank. The exact employer blueprint is still unknown.
- Comprehensions execute correctly but are visualized as a completed expression, without internal iteration/filter events. The Machine labels that scope explicitly.
- Self-explanations are prompts for reflection, not automatically graded. Content variations are authored and deterministic; no runtime LLM generates them.
- Optional study-day tracking shows days practiced, not a consecutive-day streak system. Training is self-paced; the roadmap is flexible.
- Windows x64 is the packaged target. The release is unsigned. WebView2 is required.

See the verification report in `outputs/verification/` for the checks actually completed on this build.
