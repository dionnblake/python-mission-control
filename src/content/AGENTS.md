# Curriculum

## Purpose
Own the editable, deterministic Python basics practice bank and the default exam blueprint.

## Ownership
`foundation.ts` teaches first-phase execution. `fluency.ts` combines concepts and debugging. `flashcards.ts` owns the hand-authored retention bank and its schema validator. `helpers.ts` builds consistent variants. `index.ts` exports the bank, topic metadata, baseline and boss selections, flashcards and validation.

## Local Contracts
- Each family has four deterministic variations with stable IDs. No runtime content generation service or network access.
- `code` is actual runnable Python. `displayCode` may show a missing or buggy line before prediction; it must never be sent to the runner. Fill-line and standalone repair items reveal the completed correct source after commitment.
- Every item declares exact stdout and, when applicable, the expected exception class. Whitespace in stdout matters.
- Ordering answers are choice IDs joined with `|`; `order` is the same canonical sequence. Display ordering is deliberately shuffled.
- Debugging incidents require identifying the faulty line, choosing a bounded repair, then executing the complete repaired code.
- Distractors explain a specific mental-model error. Hints progress from attention guidance to a partial explanation.
- Examples use controlled in-memory operations. File I/O, imports, arbitrary source, and classes are outside this starter bank.
- Flashcards use stable IDs, explicit challenge links, short concept/code-reading answers, and no runtime generation. Invalid cards are reported and withheld from queue selection.

## Work Guidance
Edit families, not duplicated instances. Maintain stable family IDs for progress continuity. Keep beginner snippets short. Avoid nondeterministic set rendering, ambiguous answers, and equivalent repair choices.

## Verification
`npm test -- src/content/content.test.ts src/content/flashcards.test.ts` validates structure, answer choices, blueprint, selections, flashcard schema and exact CPython output for code-reading cards. `python_audit.test.ts` executes every original and repair snippet through actual isolated CPython with timeouts and exact stdout/exception checks. The runner integration audit also checks every snippet against the production helper once present.

## Child DOX Index
None.
