export const cleanAIResponse = (text: string) =>
  text.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();

export const capitalize = (s: string) =>
  s.charAt(0).toUpperCase() + s.slice(1);

export type GeneratedFile = { path: string; content: string };

/**
 * Splits an AI response containing one or more === FILE: <path> === markers
 * into individual { path, content } entries. Falls back to a single file using
 * the provided `fallbackPath` when no markers are found.
 */
export function parseMultiFileResponse(raw: string, fallbackPath: string): GeneratedFile[] {
  const cleaned = raw
    .replace(/```[a-z]*\r?\n?/gi, "")
    .replace(/```\r?\n?/g, "")
    .trim();

  const markerRegex = /^=== FILE:\s*(.+?)\s*===\s*$/;
  const lines = cleaned.split(/\r?\n/);
  const files: GeneratedFile[] = [];
  let currentPath: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const match = line.match(markerRegex);
    if (match) {
      if (currentPath !== null) {
        const content = currentLines.join("\n").trim();
        if (content) files.push({ path: currentPath, content });
      }
      currentPath = match[1].trim();
      currentLines = [];
    } else if (currentPath !== null) {
      currentLines.push(line);
    }
  }

  if (currentPath !== null) {
    const content = currentLines.join("\n").trim();
    if (content) files.push({ path: currentPath, content });
  }

  console.log("[parseMultiFileResponse] raw length:", raw.length, "| files found:", files.length, files.map(f => f.path));
  return files.length > 0 ? files : [{ path: fallbackPath, content: cleaned }];
}