import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import "../styles.css";
import type { TerminalSettings } from "./Settings";
import { isTauriRuntime } from "../utils/tauriRuntime";

type TerminalTab = {
  id: string;
  title: string;
  cwd: string;
};

type TerminalRuntime = {
  terminal: Terminal;
  fitAddon: FitAddon;
  opened: boolean;
};

type TerminalCommandOptions = {
  cwd?: string;
  title?: string;
  command?: string;
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
  exitCode?: number | null;
};

type TerminalDockProps = {
  terminalSettings?: TerminalSettings;
  getWorkspaceCwd?: () => Promise<string>;
};


const TERMINAL_DOCK_HEIGHT_KEY = "archiviz_terminal_dock_height";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const loadTerminalHeight = () => {
  const value = Number(localStorage.getItem(TERMINAL_DOCK_HEIGHT_KEY));
  return Number.isFinite(value) ? clamp(value, 180, 520) : 320;
};

export default function TerminalDock({ terminalSettings, getWorkspaceCwd }: TerminalDockProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dockHeight, setDockHeight] = useState(loadTerminalHeight);
  const terminalsRef = useRef(new Map<string, TerminalRuntime>());
  const containersRef = useRef(new Map<string, HTMLDivElement>());

  const fitTerminal = useCallback((id: string) => {
    const runtime = terminalsRef.current.get(id);
    if (!runtime) return;

    requestAnimationFrame(() => {
      runtime.fitAddon.fit();
      void invoke("terminal_resize", {
        id,
        cols: runtime.terminal.cols,
        rows: runtime.terminal.rows,
      }).catch(() => undefined);
    });
  }, []);

  const openTerminalDom = useCallback((id: string) => {
    const runtime = terminalsRef.current.get(id);
    const container = containersRef.current.get(id);
    if (!runtime || !container || runtime.opened) return;

    runtime.terminal.open(container);
    runtime.opened = true;
    fitTerminal(id);
    runtime.terminal.focus();
  }, [fitTerminal]);

  const setContainerRef = useCallback((id: string) => (node: HTMLDivElement | null) => {
    if (node) {
      containersRef.current.set(id, node);
      openTerminalDom(id);
    } else {
      containersRef.current.delete(id);
    }
  }, [openTerminalDom]);

  const createTab = useCallback(async (options: TerminalCommandOptions = {}) => {
    setError("");

    const terminal = new Terminal({
      cursorBlink: terminalSettings?.cursorBlink ?? true,
      cursorStyle: terminalSettings?.cursorStyle ?? "bar",
      convertEol: true,
      fontFamily: terminalSettings?.fontFamily ?? '"JetBrains Mono", "Cascadia Code", "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: terminalSettings?.fontSize ?? 13,
      fontWeight: 400,
      fontWeightBold: 700,
      lineHeight: 1.5,
      letterSpacing: 0,
      scrollback: 5000,
      allowProposedApi: false,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    let created: TerminalCreateResult;
    try {
      const cwd = options.cwd ?? await getWorkspaceCwd?.();
      created = await invoke<TerminalCreateResult>("terminal_create", {
        options: {
          cols: 100,
          rows: 28,
          cwd,
          shell: terminalSettings?.shell || undefined,
        },
      });
    } catch (err) {
      terminal.dispose();
      setIsOpen(true);
      setError(typeof err === "string" ? err : "Could not create terminal.");
      return;
    }

    terminal.onData((data) => {
      void invoke("terminal_write", { id: created.id, data }).catch((err) => {
        setError(typeof err === "string" ? err : "Could not write to terminal.");
      });
    });
    terminal.onResize(({ cols, rows }) => {
      void invoke("terminal_resize", { id: created.id, cols, rows }).catch(() => undefined);
    });

    terminalsRef.current.set(created.id, { terminal, fitAddon, opened: false });

    setTabs(prev => [...prev, {
      id: created.id,
      title: options.title || `${created.shell} ${prev.length + 1}`,
      cwd: created.cwd,
    }]);
    setActiveId(created.id);
    setIsOpen(true);

    if (options.command) {
      window.setTimeout(() => {
        terminal.writeln(`$ ${options.command}`);
        void invoke("terminal_write", { id: created.id, data: `${options.command}\r` });
      }, 80);
    }
  }, [getWorkspaceCwd, terminalSettings]);

  const closeTab = useCallback((id: string) => {
    void invoke("terminal_kill", { id }).catch(() => undefined);
    terminalsRef.current.get(id)?.terminal.dispose();
    terminalsRef.current.delete(id);
    containersRef.current.delete(id);

    setTabs(prev => {
      const next = prev.filter(tab => tab.id !== id);
      setActiveId(current => {
        if (current !== id) return current;
        return next[next.length - 1]?.id ?? null;
      });
      return next;
    });
  }, []);

  useEffect(() => {
    if (isOpen && tabs.length === 0) {
      void createTab();
    }
  }, [createTab, isOpen, tabs.length]);

  useEffect(() => {
    const runTerminalCommand = (event: Event) => {
      const detail = (event as CustomEvent<TerminalCommandOptions>).detail;
      void createTab(detail ?? {});
    };

    window.addEventListener("archiviz:terminal-command", runTerminalCommand);
    return () => window.removeEventListener("archiviz:terminal-command", runTerminalCommand);
  }, [createTab]);

  useEffect(() => {
    if (!isOpen || !activeId) return;
    openTerminalDom(activeId);
    fitTerminal(activeId);
    terminalsRef.current.get(activeId)?.terminal.focus();
  }, [activeId, fitTerminal, isOpen, openTerminalDom]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const unlisteners: UnlistenFn[] = [];

    void listen<TerminalDataPayload>("terminal-data", (event) => {
      terminalsRef.current.get(event.payload.id)?.terminal.write(event.payload.data);
    }).then(unlisten => unlisteners.push(unlisten));

    void listen<TerminalExitPayload>("terminal-exit", (event) => {
      const exitCode = event.payload.exitCode;
      terminalsRef.current.get(event.payload.id)?.terminal.writeln(
        `\r\n[process exited${typeof exitCode === "number" ? `: ${exitCode}` : ""}]`
      );
    }).then(unlisten => unlisteners.push(unlisten));

    return () => {
      for (const unlisten of unlisteners) unlisten();
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (activeId) fitTerminal(activeId);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activeId, fitTerminal]);

  useEffect(() => {
    localStorage.setItem(TERMINAL_DOCK_HEIGHT_KEY, String(dockHeight));
    if (activeId) fitTerminal(activeId);
  }, [activeId, dockHeight, fitTerminal]);

  const startDockResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = dockHeight;
    document.body.classList.add("resizing-panel", "resizing-panel--y");

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      setDockHeight(clamp(startHeight + startY - moveEvent.clientY, 180, 520));
    };
    const onUp = () => {
      document.body.classList.remove("resizing-panel", "resizing-panel--y");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [dockHeight]);

  useEffect(() => {
    if (!terminalSettings) return;
    for (const { terminal, fitAddon } of terminalsRef.current.values()) {
      terminal.options.fontSize = terminalSettings.fontSize;
      terminal.options.fontFamily = terminalSettings.fontFamily;
      terminal.options.cursorStyle = terminalSettings.cursorStyle;
      terminal.options.cursorBlink = terminalSettings.cursorBlink;
      fitAddon.fit();
    }
  }, [terminalSettings]);

  useEffect(() => {
    return () => {
      for (const id of terminalsRef.current.keys()) {
        void invoke("terminal_kill", { id }).catch(() => undefined);
      }
    };
  }, []);

  if (!isOpen) {
    return (
      <button className="terminal-dock-toggle" onClick={() => setIsOpen(true)} title="Open terminal">
        Terminal
      </button>
    );
  }

  return (
    <div className="terminal-dock terminal-dock--resizable" style={{ height: dockHeight }}>
      <div
        className="panel-resize-handle panel-resize-handle--top"
        onPointerDown={startDockResize}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize terminal"
        title="Resize terminal"
      />
      <div className="terminal-dock-header">
        <div className="terminal-dock-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`terminal-dock-tab ${tab.id === activeId ? "active" : ""}`}
              onClick={() => setActiveId(tab.id)}
              title={tab.cwd}
            >
              <span>{tab.title}</span>
              <span
                className="terminal-dock-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                x
              </span>
            </button>
          ))}
          <button className="terminal-dock-add" onClick={() => void createTab()} title="New terminal tab">+</button>
        </div>
        <button className="terminal-dock-hide" onClick={() => setIsOpen(false)}>Hide</button>
      </div>

      <div className="terminal-dock-body">
        {error && (
          <div className="terminal-dock-unavailable">
            {error}
          </div>
        )}
        {tabs.map(tab => (
          <div
            key={tab.id}
            ref={setContainerRef(tab.id)}
            className={`terminal-xterm-host ${tab.id === activeId ? "active" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}
