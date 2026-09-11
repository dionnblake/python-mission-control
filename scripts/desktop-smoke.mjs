import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "outputs", "verification");
const runId = new Date()
  .toISOString()
  .replaceAll(":", "-")
  .replaceAll(".", "-");
const profile = path.join(root, "work", "desktop-profile", runId);
const port = 9237;
const executable =
  process.env.PMC_TEST_EXE ||
  path.join(
    root,
    "src-tauri",
    "target",
    "release",
    "python-mission-control.exe",
  );
await mkdir(output, { recursive: true });
await mkdir(profile, { recursive: true });
const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true, entries: [] },
});
let challenges, bossIds, flashcards;
let validateProgress, createProgress, recordAttempt, scaffoldFor, scoreExam;
let rateFlashcard, selectFlashcards;
try {
  ({ challenges, bossIds } = await server.ssrLoadModule(
    "/src/content/index.ts",
  ));
  ({ flashcards } = await server.ssrLoadModule("/src/content/flashcards.ts"));
  ({ validateProgress, createProgress, recordAttempt, scaffoldFor, scoreExam } =
    await server.ssrLoadModule("/src/core/learning.ts"));
  ({ rateFlashcard, selectFlashcards } = await server.ssrLoadModule(
    "/src/core/flashcards.ts",
  ));
} finally {
  await server.close();
}
const primary = { port };
const duplicate = {
  port: 9238,
  webviewDataFolder: path.join(profile, "webview-duplicate-debug"),
};
let page;
const evidence = {
  runId,
  startedAt: new Date().toISOString(),
  executable,
  profile,
  checks: [],
  consoleErrors: [],
  nativeLogs: [],
  windowIsolation: [],
  checkpoints: [],
  screenshots: [],
  duplicateWindowSetup: {
    learnerProfileSharedByBothProcesses: profile,
    duplicateWebviewDataFolder: duplicate.webviewDataFolder,
    reason:
      "Only the second WebView2 browser cache is isolated so its separate CDP port does not conflict with the first browser process. Both apps use the identical learner SQLite profile.",
  },
};
function passed(name, detail = {}) {
  evidence.checks.push({ name, ...detail });
  console.log(`PASS ${name}`);
}
async function shot(name, targetPage = page) {
  await targetPage.evaluate(() => window.scrollTo(0, 0));
  await targetPage.screenshot({
    path: path.join(output, `${name}.png`),
    fullPage: true,
  });
  evidence.screenshots.push(`${name}.png`);
}
async function hideOwnedWindow(ownedChild) {
  if (process.platform !== "win32") return;
  const ownedPid = ownedChild?.pid;
  if (!Number.isSafeInteger(ownedPid) || ownedChild.exitCode !== null)
    throw new Error(
      "Cannot isolate the desktop window without its live spawned process ID.",
    );
  const script = `
$ErrorActionPreference = 'Stop'
try {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MissionSmokeWindow {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@
$ownedProcessId = ${ownedPid}
$ownedProcess = Get-Process -Id $ownedProcessId -ErrorAction Stop
$windowHandle = [IntPtr]::Zero
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  $ownedProcess.Refresh()
  $windowHandle = $ownedProcess.MainWindowHandle
  if ($windowHandle -ne [IntPtr]::Zero) { break }
  Start-Sleep -Milliseconds 100
}
if ($windowHandle -eq [IntPtr]::Zero) { throw 'The spawned test process has no native window.' }
[uint32]$windowProcessId = 0
[void][MissionSmokeWindow]::GetWindowThreadProcessId($windowHandle, [ref]$windowProcessId)
if ($windowProcessId -ne $ownedProcessId) { throw 'Window ownership does not match the spawned test process.' }
[void][MissionSmokeWindow]::ShowWindowAsync($windowHandle, 0)
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  if (-not [MissionSmokeWindow]::IsWindowVisible($windowHandle)) { break }
  Start-Sleep -Milliseconds 100
}
if ([MissionSmokeWindow]::IsWindowVisible($windowHandle)) { throw 'The test window is still visible.' }
@{ pid = $ownedProcessId; windowHandle = $windowHandle.ToInt64().ToString(); hidden = $true } | ConvertTo-Json -Compress
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
`;
  const shell = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const result = await new Promise((resolve, reject) => {
    const helper = spawn(
      shell,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "",
      stderr = "";
    const timeout = setTimeout(() => {
      helper.kill();
      reject(new Error("Timed out hiding the owned test window."));
    }, 20000);
    helper.stdout.on("data", (data) => {
      stdout += data;
    });
    helper.stderr.on("data", (data) => {
      stderr += data;
    });
    helper.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    helper.once("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0)
        return reject(
          new Error(
            `Could not isolate test window ${ownedPid}: ${stderr.trim()}`,
          ),
        );
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (error) {
        reject(
          new Error(`Unexpected window-isolation response: ${stdout.trim()}`, {
            cause: error,
          }),
        );
      }
    });
  });
  expect(result).toMatchObject({ pid: ownedPid, hidden: true });
  evidence.windowIsolation.push({ ...result, at: new Date().toISOString() });
  console.log(
    `ISOLATED native test window for PID ${ownedPid}; CDP interaction remains enabled.`,
  );
}
async function checkpoint(name) {
  const state = await page.evaluate(() => ({
    title: document.querySelector(".challenge-top h1")?.textContent ?? null,
    training: Boolean(document.querySelector(".challenge-screen")),
    home: Boolean(document.querySelector(".home-screen")),
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  evidence.checkpoints.push({ name, at: new Date().toISOString(), ...state });
  console.log(`CHECKPOINT ${name}: ${JSON.stringify(state)}`);
}
async function connect(target) {
  target.browser = undefined;
  target.page = undefined;
  for (let i = 0; i < 60; i++) {
    try {
      target.browser = await chromium.connectOverCDP(
        `http://127.0.0.1:${target.port}`,
      );
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!target.browser)
    throw new Error(
      "Desktop WebView2 debug endpoint did not become available.",
    );
  for (let i = 0; i < 30; i++) {
    target.page = target.browser
      .contexts()
      .flatMap((c) => c.pages())
      .find((p) => p.url().includes("tauri.localhost"));
    if (target.page) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!target.page) throw new Error("Packaged desktop page did not open.");
  target.page.on("pageerror", (e) => evidence.consoleErrors.push(e.message));
  target.page.on("console", (m) => {
    if (m.type() === "error") evidence.consoleErrors.push(m.text());
  });
  await target.page.locator("main").waitFor();
}
async function launchTarget(target) {
  const occupied = await fetch(`http://127.0.0.1:${target.port}/json/version`, {
    signal: AbortSignal.timeout(500),
  }).then(
    () => true,
    () => false,
  );
  if (occupied)
    throw new Error(
      `Desktop debug port ${target.port} is already occupied. Close the earlier test app before running this harness; it will not attach to an unrelated window.`,
    );
  if (target.webviewDataFolder)
    await mkdir(target.webviewDataFolder, { recursive: true });
  target.child = spawn(executable, [], {
    cwd: path.dirname(executable),
    windowsHide: true,
    env: {
      ...process.env,
      PMC_PROFILE_DIR: profile,
      ...(target.webviewDataFolder
        ? { WEBVIEW2_USER_DATA_FOLDER: target.webviewDataFolder }
        : {}),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${target.port}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  target.child.on("error", (e) => evidence.consoleErrors.push(e.message));
  for (const [stream, label] of [
    [target.child.stdout, "stdout"],
    [target.child.stderr, "stderr"],
  ])
    stream.on("data", (data) => {
      const message = data.toString().trim();
      if (message && !message.includes("DevTools listening")) {
        evidence.nativeLogs.push({ port: target.port, stream: label, message });
        console.log(`DESKTOP ${label}: ${message}`);
      }
    });
  await connect(target);
  await hideOwnedWindow(target.child);
}
async function launch() {
  try {
    await launchTarget(primary);
  } finally {
    page = primary.page;
  }
}
async function closeTarget(target) {
  await target.page
    ?.waitForFunction(
      () =>
        !document
          .querySelector(".local-status")
          ?.textContent?.includes("Saving"),
      {},
      { timeout: 10000 },
    )
    .catch(() => {});
  const connection = target.browser;
  target.browser = undefined;
  target.page = undefined;
  try {
    if (
      target.child &&
      target.child.exitCode === null &&
      target.child.signalCode === null
    ) {
      const closing = target.child;
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () =>
            reject(
              new Error("Desktop process did not exit after termination."),
            ),
          10000,
        );
        closing.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
        if (!closing.kill()) {
          clearTimeout(timeout);
          reject(
            new Error("Could not terminate the isolated desktop process."),
          );
        }
      });
    }
    target.child = undefined;
  } finally {
    await connection?.close().catch(() => {});
  }
  await new Promise((r) => setTimeout(r, 700));
}
async function close() {
  try {
    await closeTarget(primary);
  } finally {
    page = primary.page;
  }
}
async function ipc(command, args, targetPage = page) {
  return targetPage.evaluate(
    ([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a),
    [command, args],
  );
}
async function saved(targetPage = page) {
  await expect(targetPage.locator(".local-status")).toHaveText(
    /Saved on this device/,
  );
  return ipc("load_progress", undefined, targetPage);
}
async function nav(name) {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
}
async function ctrlWheel(deltaY) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: 720,
      y: 480,
      deltaX: 0,
      deltaY,
      modifiers: 2,
    });
  } finally {
    await session.detach();
  }
}
async function answerQuestion(q, correct = true) {
  if (q.type === "order-lines") {
    const desired = [...q.order];
    if (!correct) {
      expect(desired.length).toBeGreaterThan(1);
      [desired[0], desired[1]] = [desired[1], desired[0]];
    }
    for (let target = 0; target < desired.length; target++) {
      const text = q.choices.find((c) => c.id === desired[target]).text;
      const current = await page.locator(".order-line code").allTextContents();
      let at = current.indexOf(text);
      expect(at).toBeGreaterThanOrEqual(target);
      while (at > target) {
        await page
          .getByRole("button", { name: `Move line ${at + 1} up`, exact: true })
          .click();
        at--;
      }
    }
    const save = page.getByRole("button", {
      name: "Save this order",
      exact: true,
    });
    if (await save.count()) await save.click();
    expect(await page.locator(".order-line code").allTextContents()).toEqual(
      desired.map((id) => q.choices.find((choice) => choice.id === id).text),
    );
    return desired.join("|");
  } else {
    const id = correct ? q.answer : q.choices.find((c) => c.id !== q.answer).id;
    const index = q.choices.findIndex((c) => c.id === id);
    expect(index).toBeGreaterThanOrEqual(0);
    const buttons = page
      .getByRole("group", { name: "Answer choices" })
      .getByRole("button");
    await expect(buttons).toHaveCount(q.choices.length);
    await expect(buttons.nth(index).locator("code")).toHaveText(
      q.choices[index].text,
    );
    await buttons.nth(index).click();
    return id;
  }
}
async function chooseRepair(q, correct = true) {
  const index = q.repair.choices.findIndex((c) =>
    correct ? c.id === q.repair.answer : c.id !== q.repair.answer,
  );
  expect(index).toBeGreaterThanOrEqual(0);
  const choice = page.locator(".repair-choices .choice").nth(index);
  await expect(choice.locator("code")).toHaveText(q.repair.choices[index].text);
  await choice.click();
}
async function currentTraining() {
  const title = await page.locator(".challenge-top h1").innerText();
  const source = (
    await page.locator(".challenge-code .line-text").allTextContents()
  ).join("\n");
  const q =
    challenges.find(
      (c) => c.title === title && (c.displayCode || c.code) === source,
    ) || challenges.find((c) => c.title === title && c.code === source);
  if (!q)
    throw new Error(`Could not identify training content: ${title}\n${source}`);
  return q;
}
async function finishAssessment(kind, options = {}) {
  const before = validateProgress(await saved());
  const active = before.activeAssessment;
  const expectedAnswers = { ...active.answers };
  for (let i = active.index; i < active.ids.length; i++) {
    const q = challenges.find((c) => c.id === active.ids[i]);
    expectedAnswers[q.id] = await answerQuestion(
      q,
      options.correct ?? i % 4 !== 1,
    );
    await expect(page.getByTestId("python-machine")).toHaveCount(0);
    await expect(page.getByTestId("explanation")).toHaveCount(0);
    await expect(page.getByTestId("correct-answer")).toHaveCount(0);
    await expect(page.getByTestId("incorrect-answer")).toHaveCount(0);
    await expect(page.locator(".hint-button")).toHaveCount(0);
    await page
      .getByRole("button", {
        name:
          i === active.ids.length - 1 ? "Review and submit" : "Next question",
        exact: true,
      })
      .click();
  }
  const unsubmitted = validateProgress(await saved());
  expect(unsubmitted.attempts.length).toBe(before.attempts.length);
  expect(unsubmitted.exams.length).toBe(before.exams.length);
  expect(unsubmitted.activeAssessment.answers).toEqual(expectedAnswers);
  await page
    .getByRole("button", { name: "Submit and see results", exact: true })
    .click();
  await expect(page.locator(".results-screen")).toBeVisible();
  const p = validateProgress(await saved());
  const result = p.exams.at(-1);
  expect(result.kind).toBe(kind);
  expect(result.challengeIds.length).toBe(active.ids.length);
  const expected = scoreExam(
    active.ids.map((id) => challenges.find((q) => q.id === id)),
    expectedAnswers,
  );
  expect(result.answers).toEqual(expectedAnswers);
  expect(result.score).toBe(expected.score);
  expect(result.topics).toEqual(expected.topics);
  expect(p.exams.length).toBe(before.exams.length + 1);
  expect(p.attempts.length).toBe(before.attempts.length + active.ids.length);
  passed(`${kind} one-question flow, delayed feedback, and topic scoring`, {
    fixtureAssisted: options.fixtureAssisted ?? false,
    score: result.score,
    expectedScore: expected.score,
    questions: result.challengeIds.length,
  });
  await shot(options.screenshotName ?? `${kind}-results`);
}

async function flashcardUIRegression() {
  await nav("Flashcards");
  await expect(page.locator(".flashcards-screen")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Recommended", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText(/64 cards in this view/, { exact: false }),
  ).toBeVisible();
  await shot("flashcards-home");

  await page.getByRole("button", { name: "Needs Work", exact: true }).click();
  const flashcardSnapshot = validateProgress(await saved());
  const emptyTopic = [...new Set(flashcards.map((card) => card.topic))].find(
    (topic) =>
      selectFlashcards(
        flashcards,
        flashcardSnapshot,
        "needs-work",
        topic,
        Date.now(),
        flashcards.length,
      ).length === 0,
  );
  if (!emptyTopic) throw new Error("Smoke fixture has no empty Needs Work topic.");
  await page.getByLabel("Flashcard topic", { exact: true }).selectOption(emptyTopic);
  await expect(
    page.getByText("No cards match this view yet.", { exact: true }),
  ).toBeVisible();
  passed("Flashcards Needs Work empty state is actionable");

  await page.getByRole("button", { name: "All Cards", exact: true }).click();
  await page.getByLabel("Flashcard topic", { exact: true }).selectOption("variables");
  await expect(page.getByText(/8 cards in this view/, { exact: false })).toBeVisible();
  await page
    .getByRole("button", { name: "Review this view", exact: true })
    .click();
  await expect(page.locator(".flashcard-study-surface")).toBeVisible();
  await expect(page.getByText(/What does an assignment such as/)).toBeVisible();
  await expect(page.locator(".flashcard-answer")).toHaveCount(0);
  await expect(page.getByText(/CARD 1 \/ 8/)).toBeVisible();
  await shot("flashcard-concept-front");
  await page.locator(".flashcard-study-surface").press(" ");
  await expect(page.locator(".flashcard-answer")).toBeVisible();
  await expect(page.locator(".flashcard-ratings button")).toHaveCount(3);
  await expect(page.getByText(/It binds the name/)).toBeVisible();
  await shot("flashcard-concept-answer");
  await page.locator(".flashcard-study-surface").press("3");
  await expect(page.getByText(/CARD 2 \/ 8/)).toBeVisible();
  await page.getByRole("button", { name: "Return to flashcards", exact: true }).click();

  await page.getByLabel("Flashcard topic", { exact: true }).selectOption("collections");
  await page
    .getByRole("button", { name: "Review this view", exact: true })
    .click();
  await expect(page.locator(".flashcard-study-surface .code-panel")).toBeVisible();
  await expect(page.getByText(/What is x after this code/)).toBeVisible();
  await shot("flashcard-code-front");
  await page.getByRole("button", { name: /^Show answer/ }).click();
  await expect(page.locator(".flashcard-output")).toContainText("[1, 2, 3]");
  await shot("flashcard-code-answer");
  await page.getByRole("button", { name: /Again/ }).click();
  await expect(page.getByText(/CARD 2 \/ 9/)).toBeVisible();
  await page.getByRole("button", { name: "Return to flashcards", exact: true }).click();
  await page.getByRole("button", { name: "Needs Work", exact: true }).click();
  await expect(page.getByText(/1 cards in this view|2 cards in this view/, { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "All Cards", exact: true }).click();
  await page.getByLabel("Flashcard topic", { exact: true }).selectOption("functions");
  await expect(page.getByText(/8 cards in this view/, { exact: false })).toBeVisible();
  await page
    .getByRole("button", { name: "Review this view", exact: true })
    .click();
  for (let index = 0; index < 8; index += 1) {
    await page.getByRole("button", { name: /^Show answer/ }).click();
    await page.getByRole("button", { name: /Hard/ }).click();
  }
  await expect(page.getByText("REVIEW COMPLETE", { exact: true })).toBeVisible();
  await expect(page.getByText(/8 cards reviewed/)).toBeVisible();
  await shot("flashcard-summary");
  await page
    .getByRole("button", { name: "Return to Mission Control", exact: true })
    .click();
  passed(
    "Flashcards concept/code fronts, keyboard reveal/rating, Hard, summary, and priority filter",
    { starterCards: flashcards.length },
  );
  await nav("Mission control");
}

async function masterResetRegression(actualSnapshot) {
  await page
    .getByRole("button", { name: "Preferences", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Master reset", exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Reset progress and settings", exact: true })
    .click();
  await expect(
    page.getByRole("region", {
      name: "Reset everything and start over?",
      exact: true,
    }),
  ).toContainText(
    "Reset everything and start over?",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reset progress and settings", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset progress and settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Yes, reset everything", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start baseline mission", exact: true }),
  ).toBeVisible();
  const reset = validateProgress(await saved());
  expect(reset).toMatchObject({
    onboardingComplete: false,
    baselineComplete: false,
    xp: 0,
    sessions: 0,
    studyDays: [],
    concepts: {},
    attempts: [],
    exams: [],
    flashcards: {},
  });
  expect(reset.activeAssessment).toBeUndefined();
  expect(reset.settings).toEqual(createProgress(reset.startedAt).settings);
  await shot("master-reset");

  await close();
  await launch();
  await expect(
    page.getByRole("button", { name: "Start baseline mission", exact: true }),
  ).toBeVisible();
  expect(validateProgress(await saved())).toMatchObject({
    onboardingComplete: false,
    xp: 0,
    attempts: [],
    exams: [],
    flashcards: {},
  });
  passed("Master reset remains cleared after a desktop restart");

  await ipc("save_progress", { progress: validateProgress(actualSnapshot) });
  await page.reload();
  await expect(page.locator(".home-screen")).toBeVisible();
  expect(validateProgress(await saved())).toEqual(actualSnapshot);
  passed(
    "Confirmed master reset clears all learner state and restores default settings",
    { fixtureAssisted: false, restoredAfterCheck: true },
  );
}

async function loadFixture(progress) {
  await saved();
  await ipc("save_progress", { progress: validateProgress(progress) });
  await page.reload();
  await expect(page.locator(".sidebar")).toBeVisible();
  await saved();
}

async function fixtureRegressions(actualSnapshot) {
  let fixtureError;
  let restoreFailure;
  evidence.fixtureChecks = {
    fixtureAssisted: true,
    purpose:
      "Exercise otherwise slow or uncommon UI states through the isolated desktop test database.",
    sourceSnapshot: "actual-run-progress.json",
    restoreStatus: "PENDING",
  };
  try {
    const caughtUpBase = createProgress(Date.now());
    const caughtUpNow = Date.now();
    const caughtUpStates = {};
    for (const card of flashcards) {
      const state = rateFlashcard(caughtUpBase, card, "got-it", caughtUpNow);
      caughtUpStates[card.id] = state;
    }
    const caughtUp = {
      ...structuredClone(actualSnapshot),
      flashcards: caughtUpStates,
    };
    await loadFixture(caughtUp);
    await nav("Flashcards");
    await expect(page.getByText("Your due queue is clear.", { exact: true })).toBeVisible();
    const caughtUpButtons = page.getByRole("button", {
      name: "You're caught up",
      exact: true,
    });
    await expect(caughtUpButtons).toHaveCount(2);
    for (const button of await caughtUpButtons.all()) {
      await expect(button).toBeDisabled();
    }
    await shot("flashcards-caught-up");
    passed("Flashcards caught-up state reports no due cards without fake urgency", {
      fixtureAssisted: true,
      due: 0,
    });
    await nav("Mission control");
    const ordered = challenges.find((q) => q.type === "order-lines");
    expect(ordered).toBeTruthy();
    for (const correct of [false, true]) {
      const fixture = structuredClone(actualSnapshot);
      fixture.activeAssessment = {
        id: `fixture-order-${correct}-${runId}`,
        mode: "baseline",
        ids: [ordered.id],
        answers: {},
        confidences: {},
        times: {},
        startedAt: Date.now(),
        deadline: null,
        index: 0,
      };
      await loadFixture(fixture);
      await expect(page.locator(".order-choices")).toBeVisible();
      await finishAssessment("baseline", {
        correct,
        fixtureAssisted: true,
        screenshotName: `fixture-order-${correct ? "correct" : "wrong"}-results`,
      });
      expect((await saved()).exams.at(-1).score).toBe(correct ? 100 : 0);
    }
    passed("Ordering controls preserve intended wrong and correct answers", {
      fixtureAssisted: true,
      setup: "One-question baseline fixtures; answers selected through the UI.",
    });

    const topicBank = challenges.filter((q) => q.topic === "variables");
    const families = [...new Set(topicBank.map((q) => q.family))];
    for (const [level, count] of [
      ["light", 4],
      ["independent", 8],
    ]) {
      const now = Date.now();
      let fixture = createProgress(now - 86400000);
      fixture.onboardingComplete = true;
      fixture.baselineComplete = true;
      fixture.settings.sessionLength = 6;
      fixture.settings.weights = Object.fromEntries(
        Object.keys(fixture.settings.weights).map((topic) => [
          topic,
          topic === "variables" ? 100 : 0,
        ]),
      );
      let sequence = 0;
      for (const family of families) {
        const variants = topicBank.filter((q) => q.family === family);
        for (let index = 0; index < count; index += 1) {
          const q = variants[index % variants.length];
          fixture = recordAttempt(fixture, {
            id: `fixture-${level}-${family}-${index}`,
            challengeId: q.id,
            family,
            topic: q.topic,
            answer: q.answer,
            correct: true,
            hints: 0,
            confidence: 4,
            elapsedMs: 5000,
            at: now - 3600000 + sequence++ * 1000,
            mode: "training",
          });
        }
      }
      await loadFixture(fixture);
      await page.setViewportSize({
        width: level === "independent" ? 1000 : 1440,
        height: 960,
      });
      await page
        .getByRole("button", { name: "Start today’s mission", exact: true })
        .click();
      const q = await currentTraining();
      expect(scaffoldFor(fixture, q)).toBe(level);
      await expect(page.locator(".challenge-top .mode-label")).toHaveText(
        level === "light" ? "Reduced assistance" : "Independent practice",
      );
      await expect(page.locator(".hint-button")).toHaveCount(0);
      await expect(
        page.locator(".challenge-code textarea.scratchpad"),
      ).toBeVisible();
      await shot(`fixture-${level}-scratchpad`);
      await answerQuestion(q, true);
      await page
        .getByRole("button", { name: /^Lock answer(?:\s*↵)?$/ })
        .click();
      await expect(page.getByTestId("correct-answer")).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Run Python Machine/ }),
      ).toHaveCount(level === "light" ? 1 : 0);
      passed(`${level} scaffold exposes only its permitted assistance`, {
        fixtureAssisted: true,
        setup: `${count} synthetic correct unaided attempts per variables family via recordAttempt.`,
        questionId: q.id,
        compactScratchpadChecked: level === "independent",
      });
    }

    await page.setViewportSize({ width: 1440, height: 960 });
    const expired = structuredClone(actualSnapshot);
    const startedAt = Date.now() - 8 * 86400000;
    expired.startedAt = Math.min(expired.startedAt, startedAt);
    const expiryId = `fixture-expired-${runId}`;
    expired.activeAssessment = {
      id: expiryId,
      mode: "exam",
      ids: topicBank.slice(0, 2).map((q) => q.id),
      answers: {},
      confidences: {},
      times: {},
      startedAt,
      deadline: startedAt + 1000,
      index: 0,
    };
    await saved();
    await ipc("save_progress", { progress: validateProgress(expired) });
    await close();
    await launch();
    await expect(page.locator(".results-screen")).toBeVisible({
      timeout: 15000,
    });
    const autoSubmitted = validateProgress(await saved());
    expect(autoSubmitted.activeAssessment).toBeUndefined();
    expect(autoSubmitted.exams.length).toBe(actualSnapshot.exams.length + 1);
    expect(autoSubmitted.exams.at(-1)).toMatchObject({
      id: expiryId,
      score: 0,
      elapsedMs: 1000,
    });
    expect(autoSubmitted.attempts.length).toBe(
      actualSnapshot.attempts.length + 2,
    );
    await shot("fixture-expired-exam-results");
    await close();
    await launch();
    await expect(page.locator(".home-screen")).toBeVisible();
    expect(validateProgress(await saved())).toEqual(autoSubmitted);
    passed(
      "Expired exam submits once after cold restart and caps elapsed at its deadline",
      {
        fixtureAssisted: true,
        setup:
          "Isolated saved assessment expired eight days ago with a one-second duration.",
        expectedElapsedMs: 1000,
        secondRestartPreservesSingleSubmission: true,
      },
    );
  } catch (error) {
    fixtureError = error;
    if (page && !page.isClosed()) await shot("fixture-failure").catch(() => {});
  } finally {
    try {
      if (!page || page.isClosed()) {
        await close();
        await launch();
      }
      await saved();
      await ipc("save_progress", {
        progress: validateProgress(actualSnapshot),
      });
      await page.reload();
      await expect(page.locator(".home-screen")).toBeVisible();
      expect(validateProgress(await saved())).toEqual(actualSnapshot);
      evidence.fixtureChecks.restoreStatus = "RESTORED_AND_VERIFIED";
      await shot("real-run-restored");
      passed(
        "Real UI study-session snapshot restored after fixture-assisted regressions",
        { fixtureAssisted: true },
      );
    } catch (restoreError) {
      evidence.fixtureChecks.restoreStatus = "FAILED";
      evidence.fixtureChecks.restoreError =
        restoreError.stack || String(restoreError);
      restoreFailure = restoreError;
    }
  }
  if (restoreFailure)
    throw new AggregateError(
      [fixtureError, restoreFailure].filter(Boolean),
      "Could not restore the real-run snapshot after fixture-assisted checks; actual-run-progress.json preserves it.",
    );
  if (fixtureError) throw fixtureError;
}

async function duplicateWindowRegression(actualSnapshot) {
  expect(validateProgress(await saved())).toEqual(actualSnapshot);
  await launchTarget(duplicate);
  await expect(duplicate.page.locator(".startup-error")).toBeVisible();
  await expect(duplicate.page.getByRole("alert")).toContainText(
    "This learner profile is already open in another Python Mission Control window.",
  );
  await expect(duplicate.page.locator(".sidebar")).toHaveCount(0);
  for (const command of ["load_progress", "save_progress"]) {
    const outcome = await duplicate.page.evaluate(
      async ([name, progress]) => {
        try {
          await window.__TAURI_INTERNALS__.invoke(
            name,
            name === "save_progress" ? { progress } : undefined,
          );
          return { rejected: false };
        } catch (error) {
          return { rejected: true, error: String(error) };
        }
      },
      [command, actualSnapshot],
    );
    expect(outcome).toMatchObject({
      rejected: true,
      error: expect.stringContaining("already open"),
    });
  }
  expect(validateProgress(await saved())).toEqual(actualSnapshot);
  await shot("duplicate-profile-blocked", duplicate.page);
  await close();
  await duplicate.page
    .getByRole("button", { name: "Retry connection", exact: true })
    .click();
  await expect(duplicate.page.locator(".home-screen")).toBeVisible();
  expect(validateProgress(await saved(duplicate.page))).toEqual(actualSnapshot);
  await shot("duplicate-profile-recovered", duplicate.page);
  await closeTarget(duplicate);
  await launch();
  await expect(page.locator(".home-screen")).toBeVisible();
  expect(validateProgress(await saved())).toEqual(actualSnapshot);
  passed(
    "Duplicate profile window rejects load and save, then retries unchanged progress after the first closes",
    {
      fixtureAssisted: false,
      firstPort: primary.port,
      secondPort: duplicate.port,
      snapshotUnchanged: true,
      primaryRelaunchVerified: true,
    },
  );
}

try {
  await launch();
  const runtime = await ipc("runtime_info");
  expect(runtime).toMatchObject({
    bundled: true,
    localOnly: true,
    isolatedProfile: true,
  });
  passed(
    "Packaged Windows app uses bundled CPython and isolated local SQLite",
    runtime,
  );
  const prior = await ipc("load_progress");
  expect(prior).toBeNull();
  await expect(
    page.getByRole("button", { name: "Start baseline mission", exact: true }),
  ).toBeVisible();
  await shot("onboarding");
  await page
    .getByRole("button", { name: "Start baseline mission", exact: true })
    .click();
  await expect(page.locator(".assessment-screen")).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Training deck", exact: true }),
  ).toBeEnabled();
  await nav("Training deck");
  await expect(
    page.getByRole("button", { name: "Start a mixed mission", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.locator(".assessment-screen")).toBeVisible();
  await shot("baseline");
  await finishAssessment("baseline");
  await page
    .getByRole("button", { name: "Mission control", exact: true })
    .last()
    .click();
  await shot("home");
  await flashcardUIRegression();
  await page
    .getByRole("button", { name: "Start today’s mission", exact: true })
    .click();
  const first = await currentTraining();
  await expect(
    page.getByRole("button", { name: /Run Python Machine/ }),
  ).toHaveCount(0);
  await shot("training");
  await page
    .getByRole("button", { name: "Confidence 5 of 5", exact: true })
    .click();
  await answerQuestion(first, false);
  await page.getByRole("button", { name: "Lock answer" }).click();
  await expect(page.getByTestId("incorrect-answer")).toBeVisible();
  await shot("incorrect-answer");
  const afterLock = await saved();
  const firstAttempt = afterLock.attempts.at(-1);
  expect(firstAttempt.correct).toBe(false);
  expect(firstAttempt.confidence).toBe(5);
  expect(afterLock.concepts[first.family].dueAt - firstAttempt.at).toBe(600000);
  await nav("Your progress");
  await page
    .getByRole("button", { name: "Resume mission", exact: true })
    .click();
  await expect(page.getByTestId("incorrect-answer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Lock answer" })).toHaveCount(
    0,
  );
  expect((await saved()).attempts.length).toBe(afterLock.attempts.length);
  passed("Locked answer survives navigation without duplicate credit");
  await page.getByRole("button", { name: /Run Python Machine/ }).click();
  await expect(page.getByTestId("python-machine")).toBeVisible();
  await page.getByRole("button", { name: /Next step/ }).click();
  await expect(page.locator(".code-line.executing")).toBeVisible();
  for (let i = 0; i < 3; i++) {
    const next = page.getByRole("button", { name: /Next step/ });
    if (await next.count()) await next.click();
  }
  await shot("python-machine");
  const trace = await ipc("run_trace", {
    code: "x = 4\ny = x + 3\nif y > 5:\n    x = y * 2\nprint(x)",
  });
  expect(trace.output).toBe("14\n");
  expect(
    trace.events.some((e) =>
      e.changes.some(
        (c) => c.name === "x" && c.before === "4" && c.after === "14",
      ),
    ),
  ).toBe(true);
  expect(
    trace.events.some((e) => e.event === "branch" && e.decision === true),
  ).toBe(true);
  passed(
    "Python Machine trace matches actual Python and 4 → 14 state transition",
  );
  await page
    .getByRole("button", { name: "Back to explanation", exact: true })
    .click();
  await expect(page.getByTestId("explanation")).toBeVisible();
  await shot("explanation");
  await page
    .getByRole("button", { name: "Try a related challenge", exact: true })
    .click();
  const related = await currentTraining();
  expect(related.family).toBe(first.family);
  expect(related.id).not.toBe(first.id);
  passed("Wrong prediction receives a related variation");
  await answerQuestion(related, true);
  await page.getByRole("button", { name: "Lock answer" }).click();
  await expect(page.getByTestId("correct-answer")).toBeVisible();
  await shot("correct-answer");
  let saw = new Set([first.type, related.type]);
  while (await page.locator(".challenge-screen").count()) {
    const q = await currentTraining();
    saw.add(q.type);
    const lock = page.getByRole("button", { name: "Lock answer" });
    if (await lock.count()) {
      await answerQuestion(q, true);
      await lock.click();
    }
    if (q.repair) {
      await chooseRepair(q, true);
      await page
        .getByRole("button", { name: "Verify repair", exact: true })
        .click();
      await expect(
        page.getByText("Repair verified by Python.", { exact: true }),
      ).toBeVisible();
    }
    await page
      .getByRole("button", {
        name: /^(Continue mission|Finish mission|Try a related challenge)$/,
      })
      .last()
      .click();
  }
  await expect(page.locator(".session-summary")).toBeVisible();
  await shot("session-complete");
  const finished = validateProgress(await saved());
  expect(finished.sessions).toBe(1);
  passed("Complete realistic training mission", {
    types: [...saw],
    attempts: finished.attempts.length,
    xp: finished.xp,
  });
  await nav("Your progress");
  await shot("progress");
  await nav("Mock exams");
  await shot("exam-room");
  await page
    .getByRole("button", { name: "Start mock exam", exact: true })
    .click();
  await shot("mock-exam");
  const active = (await saved()).activeAssessment;
  const q = challenges.find((c) => c.id === active.ids[0]);
  await answerQuestion(q, true);
  await page
    .getByRole("button", { name: "Next question", exact: true })
    .click();
  const beforeRestart = validateProgress(await saved());
  await close();
  await launch();
  await expect(page.locator(".assessment-screen")).toBeVisible();
  const resumed = validateProgress(await saved());
  expect(resumed.xp).toBe(beforeRestart.xp);
  expect(resumed.activeAssessment).toEqual(beforeRestart.activeAssessment);
  passed("Cold restart preserves progress and unfinished timed exam deadline");
  await finishAssessment("exam");
  await page
    .getByRole("button", { name: "Mission control", exact: true })
    .last()
    .click();
  await shot("home-after-exam");
  await nav("Training deck");
  await page.getByRole("button", { name: "Investigate", exact: true }).click();
  const bug = await currentTraining();
  await answerQuestion(bug, true);
  await page.getByRole("button", { name: "Lock answer" }).click();
  await chooseRepair(bug, false);
  await page
    .getByRole("button", { name: "Verify repair", exact: true })
    .click();
  await expect(
    page.getByText("That repair does not meet the goal yet.", { exact: true }),
  ).toBeVisible();
  expect((await saved()).attempts.at(-1).correct).toBe(false);
  await chooseRepair(bug, true);
  await page
    .getByRole("button", { name: "Verify repair", exact: true })
    .click();
  await expect(
    page.getByText("Repair verified by Python.", { exact: true }),
  ).toBeVisible();
  await shot("debug-repair");
  passed(
    "Bug finding, failed repair, actual successful verification, and persisted repair attempts",
  );
  await page
    .getByRole("button", { name: "Continue mission", exact: true })
    .click();
  await checkpoint("second-boss-before-answer");
  await expect(page.locator(".challenge-screen")).toBeVisible();
  const skippedRepair = await currentTraining();
  expect(skippedRepair.id).toBe(bossIds[1]);
  expect(skippedRepair.repair).toBeTruthy();
  await answerQuestion(skippedRepair, true);
  await checkpoint("second-boss-after-choice");
  await page.getByRole("button", { name: /^Lock answer(?:\s*↵)?$/ }).click();
  const beforeSkip = validateProgress(await saved());
  await page
    .getByRole("button", { name: "Continue and revisit later", exact: true })
    .click();
  const afterSkip = validateProgress(await saved());
  expect(afterSkip.attempts.length).toBe(beforeSkip.attempts.length + 1);
  const skippedAttempt = afterSkip.attempts.at(-1);
  expect(skippedAttempt).toMatchObject({
    challengeId: skippedRepair.id,
    family: skippedRepair.family,
    answer: "repair:skipped",
    correct: false,
  });
  expect(
    afterSkip.concepts[skippedRepair.family].dueAt - skippedAttempt.at,
  ).toBe(3600000);
  passed(
    "Skipping an unverified repair persists an incorrect attempt and schedules review",
    { fixtureAssisted: false },
  );

  const typingQuestion = await currentTraining();
  const scratchpad = page.locator(".challenge-code textarea.scratchpad");
  await scratchpad.click();
  await scratchpad.pressSequentially("h1234r");
  await scratchpad.press("Enter");
  await scratchpad.press("Space");
  await expect(scratchpad).toHaveValue("h1234r\n ");
  await expect(
    page.getByRole("button", { name: /^Lock answer(?:\s*↵)?$/ }),
  ).toBeVisible();
  await expect(page.locator(".hint-panel")).toHaveCount(0);
  await expect(
    page
      .getByRole("group", { name: "Answer choices" })
      .locator('[aria-pressed="true"]'),
  ).toHaveCount(0);
  expect((await saved()).attempts.length).toBe(afterSkip.attempts.length);
  passed(
    "Typing H, answer numbers, R, Enter and Space does not trigger study shortcuts",
    {
      fixtureAssisted: false,
      questionId: typingQuestion.id,
    },
  );
  await nav("Mission control");
  for (const width of [320, 375, 414, 768, 1000, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    const sizes = await page.evaluate(() => ({
      viewport: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.viewport);
    await shot(`home-${width}`);
  }
  passed("Home layout has no horizontal overflow at six widths");
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Text size", { exact: true }).selectOption("1.25");
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await nav("Mission control");
  await shot("home-text-125");
  passed("Text scaling and preferences persist");
  expect((await saved()).settings.textScale).toBe(1.25);
  await ctrlWheel(-120);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.fontSize))
    .toBe("22px");
  expect((await saved()).settings.textScale).toBe(1.375);
  await ctrlWheel(120);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.fontSize))
    .toBe("20px");
  expect((await saved()).settings.textScale).toBe(1.25);
  passed("Ctrl+mouse wheel changes and persists text zoom");
  const actualSnapshot = validateProgress(await saved());
  await writeFile(
    path.join(output, "actual-run-progress.json"),
    JSON.stringify(actualSnapshot, null, 2),
  );
  await masterResetRegression(actualSnapshot);
  await fixtureRegressions(actualSnapshot);
  await duplicateWindowRegression(actualSnapshot);
  const final = validateProgress(await saved());
  expect(final).toEqual(actualSnapshot);
  await writeFile(
    path.join(output, "test-progress.json"),
    JSON.stringify(final, null, 2),
  );
  expect(evidence.consoleErrors).toEqual([]);
  passed("No desktop JavaScript console errors");
  evidence.status = "PASS";
} catch (error) {
  evidence.status = "FAIL";
  evidence.error = error.stack || String(error);
  console.error(error);
  if (page) await shot("failure").catch(() => {});
  process.exitCode = 1;
} finally {
  const cleanupFailures = [];
  for (const target of [duplicate, primary]) {
    try {
      await closeTarget(target);
    } catch (cleanupError) {
      cleanupFailures.push({
        port: target.port,
        pid: target.child?.pid,
        error: cleanupError.stack || String(cleanupError),
      });
      console.error(cleanupError);
    }
  }
  evidence.cleanup = cleanupFailures.length
    ? { status: "FAILED", failures: cleanupFailures }
    : {
        status: "DESKTOP_PROCESS_CLOSED",
        bothOwnedWindowsClosed: true,
        profileRetainedAsEvidence: profile,
      };
  if (cleanupFailures.length) {
    evidence.status = "FAIL";
    process.exitCode = 1;
  }
  evidence.finishedAt = new Date().toISOString();
  await writeFile(
    path.join(output, "desktop-smoke.json"),
    JSON.stringify(evidence, null, 2),
  );
}
