export type ProjectFile = { path: string; content: string };

export type GenerationChange = {
  path: string;
  kind: "add" | "modify";
  before: string;
  after: string;
  selected: boolean;
};

export function createGenerationPlan(existing: ProjectFile[], generated: ProjectFile[]): GenerationChange[] {
  const current = new Map(existing.map(file => [file.path, file.content]));
  const proposed = new Map(generated.map(file => [file.path, file.content]));
  return [...proposed.entries()]
    .filter(([path, content]) => current.get(path) !== content)
    .map(([path, content]) => ({
      path,
      kind: current.has(path) ? "modify" as const : "add" as const,
      before: current.get(path) ?? "",
      after: content,
      selected: true,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function applyGenerationPlan(existing: ProjectFile[], changes: GenerationChange[]): ProjectFile[] {
  const files = new Map(existing.map(file => [file.path, file.content]));
  for (const change of changes) {
    if (change.selected) files.set(change.path, change.after);
  }
  return [...files.entries()].map(([path, content]) => ({ path, content }));
}
