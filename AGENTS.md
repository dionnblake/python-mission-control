# Python Mission Control

## Purpose
A local Windows study game for one learner preparing for a Python basics exam in approximately 90 days. Success is useful practice and improving mock exam performance.

## Ownership
React/TypeScript owns interaction and deterministic learning logic. Tauri owns native execution and local storage. A bundled Python helper traces controlled curriculum code with actual CPython.

## Local Contracts
- No accounts, runtime network requests, AI services, arbitrary shell commands, or repository ingestion.
- Require a committed prediction before showing execution or explanations. Baseline and exams delay all feedback until submission.
- Content lives outside components. Progress and review scheduling must be transparent, reproducible, and tested.
- Code is controlled content; bound time, steps, output, and accepted Python operations. Do not claim this is a general security sandbox.
- Preserve local learner data. Errors must remain visible and recoverable.
- Desktop release must include its Python runtime. No dependency on the developer's Python installation at runtime.

## Work Guidance
- Root owns package/build configuration, README, integration tests and release verification.
- Source lives in `src/`; curriculum in `src/content/`; learning calculations in `src/core/`.
- Native host lives in `src-tauri/`, tracing helper in `python/`.
- Temporary build helpers belong in `work/`; finished binaries and evidence in `outputs/`.
- Use independently authored review for material changes. Workers share the checkout; never revert another worker's edits.

## Verification
Run TypeScript checking, lint, Vitest learning/content tests, Python tests, Rust host tests, production frontend build, and packaged Windows smoke tests. Inspect real UI states and persistence after restart. Run the global verifier before closeout.

## Child DOX Index
- `src/AGENTS.md`: interface and integration contract.
- `src/content/AGENTS.md`: curriculum and blueprint.
- `src/core/AGENTS.md`: deterministic learning calculations.
- `python/AGENTS.md`: actual Python tracing and limits.
- `src-tauri/AGENTS.md`: Windows host, packaging and storage.
