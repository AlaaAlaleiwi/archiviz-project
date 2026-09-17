export type SourceFileRef = {
  path: string;
  content?: string;
};

export type StackDiagnostic = {
  path: string;
  lineNumber: number;
  column: number;
  message: string;
};

const FRAME_PATTERN = /\(([^()\s]+\.java):(\d+)\)/g;

function basenameMap(files: SourceFileRef[]) {
  const map = new Map<string, SourceFileRef>();
  for (const file of files) {
    const normalized = file.path.replace(/\\/g, "/").replace(/^\/+/, "");
    const base = normalized.split("/").pop()?.toLowerCase() ?? "";
    if (base.endsWith(".java") && !map.has(base)) map.set(base, { path: normalized, content: file.content });
  }
  return map;
}

const IGNORED_FRAME_BASENAMES = new Set([
  "bytebuddy.java",
  "unittest.java",
  "unsafe.java",
  "reflection.java",
  "virtual.java",
  "native.java",
  "unknown.java",
]);

/**
 * Extracts `at pkg.Class.method(File.java:42)` frames (and surefire headers
 * like `[ERROR] XTest.findAll:18`) into per-file diagnostics resolved against
 * workspace sources by basename. Frames that don't match a workspace file keep
 * their raw filename as the path.
 */
export function parseStackDiagnostics(output: string, files: SourceFileRef[]): StackDiagnostic[] {
  const normalized = output.replace(/\\/g, "/");
  const byBasename = basenameMap(files);
  const diagnostics = new Map<string, StackDiagnostic>();

  for (const line of normalized.split(/\r?\n/)) {
    if (/^BUILD (SUCCESS|FAILURE)/i.test(line.trim())) continue;
    for (const match of line.matchAll(FRAME_PATTERN)) {
      const [, rawFilename, lineNumberText] = match;
      const frameBase = (rawFilename.includes("/") ? rawFilename.split("/").pop()! : rawFilename).toLowerCase();
      if (IGNORED_FRAME_BASENAMES.has(frameBase)) continue;
      const lineNumber = Number(lineNumberText);
      if (!Number.isFinite(lineNumber) || lineNumber === 0) continue;

      const source = byBasename.get(frameBase);
      const message = line.trim().slice(0, 160);
      const key = source ? `${source.path}:${lineNumber}` : rawFilename.toLowerCase().replace(/[/\\]/g, "_");
      if (diagnostics.has(key)) continue;

      if (!source) {
        diagnostics.set(key, { path: rawFilename, lineNumber, column: 1, message });
        continue;
      }
      const existing = diagnostics.get(key);
      if (existing && existing.message.length >= message.length) continue;
      diagnostics.set(key, {
        path: source.path,
        lineNumber,
        column: 1,
        message: message || `Stack frame in ${frameBase}`,
      });
    }
  }
  return Array.from(diagnostics.values())
    .slice(0, 50);
}
