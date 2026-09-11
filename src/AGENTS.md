# Interface
## Purpose
Present one focused reasoning challenge at a time.
## Ownership
App.tsx and components own screens. bridge.ts owns typed native IPC. types.ts defines shared content, trace and progress contracts.
## Local Contracts
- Exams and baseline never expose hints, trace, correctness or explanations before submission.
- Active assessments lock other navigation, reject late answers, and submit on the original absolute deadline even after a restart.
- Preserve pre-answer hint use and committed answers when a mission is resumed. Bind asynchronous repair results to the originating question. Repairs and skips are recorded as assisted attempts in the same concept.
- Python Machine replaces the prediction workspace while open. Its trace is validated recursively at the IPC boundary. Comprehensions show completed-expression snapshots with an explicit scope note.
- Respect reduced motion, keyboard focus, text zoom, and typing fields.
- Keep navigation reachable down to the native window minimum of 360 by 480 logical pixels. The desktop sidebar scrolls independently in short windows; narrow windows use the responsive header.
- Bundle fonts as local files. Vite must not inline font data URLs because the desktop CSP permits same-origin fonts only.
- Every visible control must have working behavior and errors must be actionable.
## Work Guidance
Use CSS tokens and the existing graphite/amber workbench design. Keep Python prominent. Do not place curriculum strings inside React components.
## Verification
`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and actual desktop interaction checks.
## Child DOX Index
- `content/AGENTS.md`: curriculum.
- `core/AGENTS.md`: learning and review logic.
