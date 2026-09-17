import { describe, expect, it } from "vitest";
import { createHistory, recordHistory, redoHistory, undoHistory } from "./workspaceHistory";

describe("workspace history", () => {
  it("undoes and redoes complete workspace values", () => {
    const initial = { nodes: 0, files: 0 };
    const changed = recordHistory(createHistory(initial), { nodes: 1, files: 2 }, "Add service");
    const undone = undoHistory(changed);
    expect(undone.present).toEqual(initial);
    expect(redoHistory(undone).present).toEqual({ nodes: 1, files: 2 });
  });

  it("clears redo history after a new change", () => {
    const changed = recordHistory(createHistory(0), 1, "First");
    const undone = undoHistory(changed);
    expect(recordHistory(undone, 2, "Alternative").future).toEqual([]);
  });
});
