# Learning and Review

## Purpose
Provide deterministic answer evaluation, practice selection, review scheduling, exam scoring, and persisted-data validation.

## Ownership
`learning.ts` owns pure calculations. Components own session transitions and saving. Curriculum owns challenge answers and default blueprint weights.

## Local Contracts
- Concepts are challenge families. Every committed attempt has a unique ID; replaying an ID never awards progress twice.
- Correct answers earn 20 XP without hints or 10 with hints. Incorrect answers earn 5 effort XP. XP is participation, not readiness.
- Wrong confident answers return after 10 minutes; other errors after 1 hour; uncertain correct answers after 4 hours; hinted correct answers after 8 hours. Consecutive confident, unaided correct answers schedule review after 1, 3, 7, then 14 days.
- Recent accuracy uses the last eight attempts. Strong requires at least eight attempts, seven of the last eight correct, at least four unaided attempts, and at least 80% unaided accuracy. Status is a study signal, not certification.
- Assistance is guided until four family attempts with at least three recent unaided successes. Independent practice requires eight recent attempts, seven unaided successes, and a correct unaided latest attempt. Performance drops restore assistance.
- Foundation practice continues until 32 unaided correct answers and favors basic topics. Below 12 unaided correct answers, select difficulty 1; then difficulty 1–2 until 32. Fluency is 32–99 unaided correct answers; mixed exam preparation begins at 100. The UI and scheduler use this same exported policy. Calendar days and repeated mistakes never unlock harder work by themselves.
- Missions reserve up to 40% of slots for due review, then balance the configured topic weights. Zero-weight topics are excluded when positive-weight content exists. Foundation topic multipliers are 2 for variables, 1.5 for strings/conditionals, and 0.5 for exceptions/other. New variants and distinct families are preferred; a last variant is withheld when another eligible variant exists.
- Exams use seeded weighted selection. Within each selected topic, unused families take precedence. Question IDs never repeat. Insufficient positively weighted content yields a shorter exam. All-zero external weights fall back to equal weights.
- Persistence validation rejects malformed data and inconsistent aggregates with a visible error. Do not silently discard/reset learner data. Study-day keys use the learner computer's local calendar date.

## Work Guidance
Keep algorithms pure and bounded. Use curriculum defaults rather than duplicating them. Do not infer real-exam pass probability from XP or practice accuracy.

## Verification
`npm test -- src/core/learning.test.ts` and `npm run typecheck`. Tests cover edge cases and persisted corruption as well as normal practice.

## Child DOX Index
None.
