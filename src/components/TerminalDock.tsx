import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import "../styles.css";
import type { TerminalSettings } from "./Settings";

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

const terminalTheme = {
  background: "#11110f",
  foreground: "#f7f4eb",
  cursor: "#2dd4bf",
  selectionBackground: "#2dd4bf44",
  black: "#11110f",
  red: "#f87171",
  green: "#34d399",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#2dd4bf",
  white: "#f1efe7",
  brightBlack: "#6f6a5f",
  brightRed: "#fb7185",
  brightGreen: "#6ee7b7",
  brightYellow: "#fde68a",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#5eead4",
  brightWhite: "#fffdf8",
};

type TerminalDockProps = {
  terminalSettings?: TerminalSettings;
};

export default function TerminalDock({ terminalSettings }: TerminalDockProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const terminalsRef = useRef(new Map<string, TerminalRuntime>());
  const containersRef = useRef(new Map<string, HTMLDivElement>());

  const fitTerminal = useCallback((id: string) => {
    const runtime = terminalsRef.current.get(id);
    if (!runtime) return;

    requestAnimationFrame(() => {
      runtime.fitAddon.fit();
      window.electronAPI?.resizeTerminal?.(id, runtime.terminal.cols, runtime.terminal.rows);
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
    if (!window.electronAPI?.createTerminal) {
      setIsOpen(true);
      setError("Real terminal support is available in Electron. Run the desktop app to start shell sessions.");
      return;
    }

    setError("");

    let created;
    try {
      created = await window.electronAPI.createTerminal({
        cols: 100,
        rows: 28,
        cwd: options.cwd,
        shell: terminalSettings?.shell || undefined,
      });
    } catch (err: any) {
      setIsOpen(true);
      setError(err?.message ?? "Could not create terminal.");
      return;
    }

    const terminal = new Terminal({
      cursorBlink: terminalSettings?.cursorBlink ?? true,
      cursorStyle: terminalSettings?.cursorStyle ?? "bar",
      convertEol: true,
      fontFamily: terminalSettings?.fontFamily ?? '"JetBrains Mono", "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: terminalSettings?.fontSize ?? 13,
      fontWeight: 500,
      fontWeightBold: 700,
      lineHeight: 1.38,
      letterSpacing: 0,
      theme: terminalTheme,
      scrollback: 5000,
      allowProposedApi: false,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.onData((data) => window.electronAPI?.writeTerminal?.(created.id, data));
    terminal.onResize(({ cols, rows }) => window.electronAPI?.resizeTerminal?.(created.id, cols, rows));
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
        window.electronAPI?.writeTerminal?.(created.id, `${options.command}\r`);
      }, 80);
    }
  }, []);

  const closeTab = useCallback((id: string) => {
    window.electronAPI?.killTerminal?.(id);
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
    const offData = window.electronAPI?.onTerminalData?.(({ id, data }) => {
      terminalsRef.current.get(id)?.terminal.write(data);
    });
    const offExit = window.electronAPI?.onTerminalExit?.(({ id, exitCode }) => {
      terminalsRef.current.get(id)?.terminal.writeln(`\r\n[process exited: ${exitCode}]`);
    });

    return () => {
      offData?.();
      offExit?.();
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
        window.electronAPI?.killTerminal?.(id);
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
    <div className="terminal-dock">
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
        {!window.electronAPI?.createTerminal && (
          <div className="terminal-dock-unavailable">
            Real terminal support is available in Electron. Run the desktop app to start shell sessions.
          </div>
        )}
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
