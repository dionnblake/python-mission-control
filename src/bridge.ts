import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Progress, TraceEvent, TraceResult } from "./types";

export const desktop = isTauri();
export async function loadProgress(): Promise<unknown> {
  if (!desktop)
    throw new Error(
      "Open the desktop application to study. From this project, run npm start.",
    );
  return invoke("load_progress");
}
export async function saveProgress(progress: Progress): Promise<void> {
  return invoke("save_progress", { progress });
}
export function parseTrace(raw: unknown): TraceResult {
  if (!raw || typeof raw !== "object")
    throw new Error("Python returned an invalid trace.");
  const r = raw as TraceResult;
  if (
    !Array.isArray(r.events) ||
    typeof r.output !== "string" ||
    typeof r.truncated !== "boolean" ||
    !(
      r.error === null ||
      (typeof r.error?.type === "string" &&
        typeof r.error?.message === "string" &&
        Number.isInteger(r.error?.line))
    )
  ) {
    throw new Error("Python returned an incomplete trace.");
  }
  const recordOfStrings = (value: unknown): boolean =>
    Boolean(
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.values(value).every((v) => typeof v === "string"),
    );
  const validEvent = (e: TraceEvent) =>
    e &&
    Number.isInteger(e.step) &&
    e.step > 0 &&
    Number.isInteger(e.line) &&
    e.line > 0 &&
    ["line", "call", "return", "exception", "branch", "loop"].includes(
      e.event,
    ) &&
    typeof e.function === "string" &&
    typeof e.detail === "string" &&
    typeof e.output === "string" &&
    recordOfStrings(e.locals) &&
    recordOfStrings(e.globals) &&
    Array.isArray(e.changes) &&
    e.changes.every(
      (c) =>
        c &&
        typeof c.name === "string" &&
        (c.before === null || typeof c.before === "string") &&
        (c.after === null || typeof c.after === "string"),
    ) &&
    Array.isArray(e.stack) &&
    e.stack.length <= 12 &&
    e.stack.every(
      (f) =>
        f &&
        typeof f.function === "string" &&
        Number.isInteger(f.line) &&
        f.line > 0 &&
        recordOfStrings(f.locals),
    ) &&
    (e.parameters === undefined || recordOfStrings(e.parameters)) &&
    (e.returnValue === undefined || typeof e.returnValue === "string") &&
    (e.decision === undefined || typeof e.decision === "boolean") &&
    (e.iteration === undefined ||
      (Number.isInteger(e.iteration) && e.iteration > 0));
  if (
    r.events.length > 400 ||
    r.output.length > 48000 ||
    !r.events.every((e, i) => validEvent(e) && e.step === i + 1)
  )
    throw new Error("Python returned an unreadable execution event.");
  return r;
}
export async function runTrace(code: string): Promise<TraceResult> {
  return parseTrace(await invoke("run_trace", { code }));
}
