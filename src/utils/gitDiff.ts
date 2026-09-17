export type GitDiffMark = {
  added: number[];
  removed: number[];
};

export function emptyDiff(): GitDiffMark {
  return { added: [], removed: [] };
}

export function parseGitDiffLineMarks(diffText: string): GitDiffMark {
  const added: number[] = [];
  const removed: number[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of diffText.split(/\r?\n/)) {
    const hunk = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      continue;
    }
    if (!raw || /^[a-zA-Z]/.test(raw)) continue;
    if (raw.startsWith("diff ") || raw.startsWith("index ")) continue;
    if (raw.startsWith("No newline")) continue;
    if (raw.startsWith("+++")) continue;
    if (raw.startsWith("---")) continue;
    if (raw.startsWith("+++ ") || raw.startsWith("--- ")) continue;

    if (raw.startsWith("+")) {
      added.push(newLine);
      newLine += 1;
    } else if (raw.startsWith("-")) {
      removed.push(oldLine);
      oldLine += 1;
    } else if (raw.startsWith("\\")) {
      continue;
    } else {
      newLine += 1;
      oldLine += 1;
    }
  }

  return { added, removed };
}

export function diffStat(mark: GitDiffMark): { added: number; removed: number } {
  return { added: mark.added.length, removed: mark.removed.length };
}
