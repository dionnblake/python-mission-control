# Controlled CPython tracing

## Purpose
Execute curriculum snippets with real CPython and return bounded, inspectable execution events.

## Ownership
`runner.py` owns validation, instrumentation, trace events and the stdin/stdout JSON protocol. `test_runner.py` owns semantic regression tests. `requirements-build.txt` pins the build-only packager.

## Local Contracts
- Input is one JSON object with a `code` string. Output is one JSON `TraceResult` matching `src/types.ts`.
- Accept controlled basics only. No file access, arbitrary imports, dunder access, runtime network or shell capability. `math` is the only allowed module.
- Real CPython evaluates every expression. Instrumentation must not evaluate a branch expression twice or change mutable-state semantics.
- Line events describe state after the displayed statement. Exceptions, returns, branch decisions and loop-entry events have explicit event types.
- Snapshot strings are immutable. Loops count per frame and per loop entry; calls include bound parameters and stack state.
- Bound code, executed steps, elapsed time, output, displayed values and stack depth. The host enforces a separate hard process deadline. This is a controlled educational runner, not a general security sandbox.

## Work Guidance
Keep protocol output on stdout and diagnostics out of it. Build output and the build virtual environment belong in the repository's ignored `work/python-build/` and `src-tauri/resources/mission-python/`.

## Verification
Run `python -m unittest discover -s python -p test_*.py -v`. Compare meaningful trace state, output, branching, mutation, scope, calls, exceptions and limits against CPython semantics. Run native process and packaged helper checks after rebuilding.

## Child DOX Index
None.
