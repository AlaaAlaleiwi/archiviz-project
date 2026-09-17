export type HistoryEntry<T> = { label: string; value: T };
export type WorkspaceHistory<T> = { past: HistoryEntry<T>[]; present: T; future: HistoryEntry<T>[] };

export function createHistory<T>(initial: T): WorkspaceHistory<T> {
  return { past: [], present: initial, future: [] };
}

export function recordHistory<T>(history: WorkspaceHistory<T>, value: T, label: string, limit = 80): WorkspaceHistory<T> {
  return {
    past: [...history.past, { label, value: history.present }].slice(-limit),
    present: value,
    future: [],
  };
}

export function undoHistory<T>(history: WorkspaceHistory<T>): WorkspaceHistory<T> {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous.value,
    future: [{ label: previous.label, value: history.present }, ...history.future],
  };
}

export function redoHistory<T>(history: WorkspaceHistory<T>): WorkspaceHistory<T> {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, { label: next.label, value: history.present }],
    present: next.value,
    future: history.future.slice(1),
  };
}
