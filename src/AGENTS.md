# Interface
## Purpose
Present one focused reasoning challenge at a time.
## Ownership
App.tsx and components own screens. bridge.ts owns typed native IPC. types.ts defines shared content, trace and progress contracts.
## Local Contracts
- Exams and baseline never expose hints, trace, correctness or explanations before submission.
- Active assessments remain resumable while other sections are browseable; the resume banner returns to the assessment, starting another mission returns to the active assessment, late answers are rejected, and submission uses the original absolute deadline even after a restart. Flashcards are unavailable while an assessment is active so mock exams remain assistance-free.
- Preserve pre-answer hint use and committed answers when a mission is resumed. Bind asynchronous repair results to the originating question. Repairs and skips are recorded as assisted attempts in the same concept.
- Python Machine replaces the prediction workspace while open. Its trace is validated recursively at the IPC boundary. Comprehensions show completed-expression snapshots with an explicit scope note.
- Respect reduced motion, keyboard focus, text zoom, Ctrl/Cmd+wheel zoom, and typing fields. Persist zoom through the learner settings.
- Keep navigation reachable down to the native window minimum of 360 by 480 logical pixels. The desktop sidebar scrolls independently in short windows; narrow windows use the responsive header.
- Bundle fonts as local files. Vite must not inline font data URLs because the desktop CSP permits same-origin fonts only.
- Every visible control must have working behavior and errors must be actionable. Flashcards keep answer reveal and three-way rating inside the focused study surface; keyboard shortcuts must not capture editable fields.
- Preferences exposes a visible two-step master reset. Confirming it clears learner progress and active work through the native persistence boundary, including recovery data, then returns the learner to first-run onboarding with default settings.
## Work Guidance
Use CSS tokens and the existing graphite/amber workbench design. Keep Python prominent. Do not place curriculum strings inside React components. `components/Flashcards.tsx` owns session presentation only; starter cards and scheduling remain in content/core modules.
## Verification
`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and actual desktop interaction checks.
## Child DOX Index
- `content/AGENTS.md`: curriculum.
- `core/AGENTS.md`: learning and review logic.
