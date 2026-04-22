export {};

type TerminalCreateOptions = {
  cwd?: string;
  cols?: number;
  rows?: number;
};

type TerminalCreateResult = {
  id: string;
  shell: string;
  cwd: string;
};

type TerminalDataPayload = {
  id: string;
  data: string;
};

type TerminalExitPayload = {
  id: string;
  exitCode: number;
  signal?: number;
};

type WorkspaceMaterializeOptions = {
  projectName: string;
  files: Array<{ path: string; content: string }>;
};

type WorkspaceMaterializeResult = {
  cwd: string;
  displayPath: string;
};

type GitRunOptions = {
  projectName: string;
  files: Array<{ path: string; content: string }>;
  args: string[];
};

type GitRunResult = {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
  command: string;
  cwd: string;
  displayPath: string;
  isRepository: boolean;
};

type ProjectFilePayload = {
  path: string;
  name: string;
  content: string;
} | null;

type ApiRequestPayload = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
};

type ApiResponsePayload = {
  status: number;
  statusText: string;
  durationMs: number;
  headers: Record<string, string>;
  body: string;
  url?: string;
};

declare global {
  interface Window {
    electronAPI?: {
      saveProject?: (data: unknown, filePath: string) => Promise<boolean>;
      createTerminal?: (options?: TerminalCreateOptions) => Promise<TerminalCreateResult>;
      writeTerminal?: (id: string, data: string) => void;
      resizeTerminal?: (id: string, cols: number, rows: number) => void;
      killTerminal?: (id: string) => void;
      materializeWorkspace?: (options: WorkspaceMaterializeOptions) => Promise<WorkspaceMaterializeResult>;
      runGit?: (options: GitRunOptions) => Promise<GitRunResult>;
      openProjectFile?: () => Promise<ProjectFilePayload>;
      readProjectFile?: (filePath: string) => Promise<NonNullable<ProjectFilePayload>>;
      sendApiRequest?: (request: ApiRequestPayload) => Promise<ApiResponsePayload>;
      onTerminalData?: (callback: (payload: TerminalDataPayload) => void) => () => void;
      onTerminalExit?: (callback: (payload: TerminalExitPayload) => void) => () => void;
    };
  }
}
