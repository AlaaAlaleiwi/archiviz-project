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

declare global {
  interface Window {
    electronAPI?: {
      saveProject?: (data: unknown, filePath: string) => Promise<boolean>;
      createTerminal?: (options?: TerminalCreateOptions) => Promise<TerminalCreateResult>;
      writeTerminal?: (id: string, data: string) => void;
      resizeTerminal?: (id: string, cols: number, rows: number) => void;
      killTerminal?: (id: string) => void;
      materializeWorkspace?: (options: WorkspaceMaterializeOptions) => Promise<WorkspaceMaterializeResult>;
      onTerminalData?: (callback: (payload: TerminalDataPayload) => void) => () => void;
      onTerminalExit?: (callback: (payload: TerminalExitPayload) => void) => () => void;
    };
  }
}
