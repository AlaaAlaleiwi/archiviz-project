import { describe, expect, it } from "vitest";
import { diffStat, parseGitDiffLineMarks } from "./gitDiff";

const SAMPLE_DIFF = [
  "diff --git a/src/App.java b/src/App.java",
  "index 1234567..89abcde 100644",
  "--- a/src/App.java",
  "+++ b/src/App.java",
  "@@ -10,3 +10,4 @@ class App {",
  "  untouched line",
  "+new import line",
  "-bad line",
  "+replacement line",
  "  another untouched",
  "@@ -40,2 +41,3 @@ class App {",
  "-removed only",
  "  context",
  "+added only",
].join("\n");

describe("parseGitDiffLineMarks", () => {
  it("maps added lines to new-file line numbers", () => {
    const marks = parseGitDiffLineMarks(SAMPLE_DIFF);
    expect(marks.added).toEqual([11, 12, 42]);
  });

  it("keys removed lines by old-file line numbers", () => {
    const marks = parseGitDiffLineMarks(SAMPLE_DIFF);
    expect(marks.removed).toEqual([11, 40]);
  });

  it("returns empty marks for non-diff input", () => {
    const marks = parseGitDiffLineMarks("fatal: not a git repository");
    expect(diffStat(marks)).toEqual({ added: 0, removed: 0 });
  });

  it("counts stats helper", () => {
    const marks = parseGitDiffLineMarks(SAMPLE_DIFF);
    expect(diffStat(marks)).toEqual({ added: 3, removed: 2 });
  });
});
