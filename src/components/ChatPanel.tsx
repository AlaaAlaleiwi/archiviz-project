import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { AIService, ChatMessage } from "../services/AIService";
import type { WorkspaceFile } from "./FileWorkspace";

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface SavedSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  history: ChatMessage[];
  uiMessages: UiMessage[];
}

interface Props {
  ai: AIService | null;
  minimized: boolean;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
  onNewMessage: () => void;
  workspaceFiles?: WorkspaceFile[];
  onFileUpdate?: (path: string, content: string) => void;
}

// Extract **filepath:** ```lang\ncontent\n``` blocks from AI response
function extractFileBlocks(text: string): Array<{ path: string; content: string }> {
  const results: Array<{ path: string; content: string }> = [];
  // Matches: **some/path.ext:**\n```lang?\ncontent\n```
  const re = /\*\*([^\n*]+?):\*\*\s*\n```[^\n]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    results.push({ path: m[1].trim(), content: m[2] });
  }
  return results;
}

const STORAGE_KEY = "archiviz_chat_sessions";
const WELCOME: UiMessage = {
  id: "welcome",
  role: "assistant",
  content: "Hi! I'm your architecture assistant. Ask me anything about your design, Spring Boot, or microservices.",
};

// ── localStorage helpers ──────────────────────────────────────────────────────

function readSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedSession[]) : [];
  } catch { return []; }
}

function writeSessions(sessions: SavedSession[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); } catch {}
}

function sessionTitle(history: ChatMessage[]): string {
  const first = history.find(m => m.role === "user")?.content ?? "";
  return first.length > 38 ? first.slice(0, 38) + "…" : first || "New chat";
}

function formatAge(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7)   return new Date(ts).toLocaleDateString([], { weekday: "short" });
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatPanel({ ai, minimized, onMinimize, onMaximize, onClose, onNewMessage, workspaceFiles, onFileUpdate }: Props) {
  const [sessions, setSessions]       = useState<SavedSession[]>(readSessions);
  const [currentId, setCurrentId]     = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [uiMessages, setUiMessages]   = useState<UiMessage[]>([WELCOME]);
  const [history, setHistory]         = useState<ChatMessage[]>([]);
  const [input, setInput]             = useState("");
  const [streaming, setStreaming]     = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [attachedFiles, setAttachedFiles] = useState<WorkspaceFile[]>([]);

  const abortRef     = useRef<AbortController | null>(null);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  // Always reflects current `minimized` prop inside async callbacks
  const minimizedRef = useRef(minimized);
  useEffect(() => { minimizedRef.current = minimized; }, [minimized]);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null || !workspaceFiles?.length) return [];
    const q = mentionQuery.toLowerCase();
    return workspaceFiles.filter(f => f.path.toLowerCase().includes(q)).slice(0, 8);
  }, [mentionQuery, workspaceFiles]);

  useEffect(() => {
    if (!minimized) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [uiMessages, minimized]);

  const genId = () => Math.random().toString(36).slice(2, 10);

  // ── Persist session ────────────────────────────────────────────────────────

  const persistSession = useCallback((id: string, msgs: UiMessage[], hist: ChatMessage[]) => {
    if (hist.length === 0) return;
    const now = Date.now();
    setSessions(prev => {
      const existing = prev.find(s => s.id === id);
      const updated: SavedSession = {
        id,
        title: sessionTitle(hist),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        history: hist,
        uiMessages: msgs.map(m => ({ ...m, streaming: false })),
      };
      const next = [updated, ...prev.filter(s => s.id !== id)];
      writeSessions(next);
      return next;
    });
  }, []);

  // ── @ mention handling ─────────────────────────────────────────────────────

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    // Detect @ followed by optional query at cursor
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const match = before.match(/@([^\s]*)$/);
    if (match && workspaceFiles?.length) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }, [workspaceFiles]);

  const selectMention = useCallback((file: WorkspaceFile) => {
    // Replace the @query token in the input with the file path
    const cursor = inputRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, cursor);
    const after  = input.slice(cursor);
    const replaced = before.replace(/@([^\s]*)$/, `@${file.path} `);
    setInput(replaced + after);
    setMentionQuery(null);

    // Add to attached files if not already present
    setAttachedFiles(prev =>
      prev.some(f => f.path === file.path) ? prev : [...prev, file]
    );

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const pos = replaced.length;
      inputRef.current?.setSelectionRange(pos, pos);
    });
  }, [input]);

  const removeAttached = useCallback((path: string) => {
    setAttachedFiles(prev => prev.filter(f => f.path !== path));
    // Also strip @path token from input text
    setInput(prev => prev.replace(new RegExp(`@${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s?`, "g"), ""));
  }, []);

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    if (!ai || !input.trim() || streaming) return;

    const userText = input.trim();
    const hasAttachments = attachedFiles.length > 0;

    // Build message: file contents + edit instruction when files are attached
    let fullText = userText;
    if (hasAttachments) {
      const blocks = attachedFiles.map(f => {
        const ext = f.path.split(".").pop() ?? "";
        return `\n\n**${f.path}:**\n\`\`\`${ext}\n${f.content}\n\`\`\``;
      }).join("");
      fullText =
        userText +
        blocks +
        "\n\nIf you modify any of the files above, output the **complete** updated file content " +
        "using exactly this format for each changed file:\n" +
        "**<filepath>:**\n```<ext>\n<full file content>\n```";
    }

    const assistantId = genId();
    const sid         = currentId ?? genId();
    if (!currentId) setCurrentId(sid);

    setInput("");
    setAttachedFiles([]);
    setMentionQuery(null);
    setStreaming(true);
    setUiMessages(prev => [
      ...prev,
      { id: genId(),     role: "user",      content: userText },
      { id: assistantId, role: "assistant",  content: "", streaming: true },
    ]);

    abortRef.current = new AbortController();

    let newHistory   = history;
    let fullResponse = "";
    // snapshot attached paths so we can match after streaming
    const attachedPaths = attachedFiles.map(f => f.path);

    try {
      fullResponse = await ai.chatStream(
        history,
        fullText,
        (token) => {
          setUiMessages(prev =>
            prev.map(m => m.id === assistantId ? { ...m, content: m.content + token } : m)
          );
        },
        abortRef.current.signal,
      );

      newHistory = [
        ...history,
        { role: "user",      content: fullText },
        { role: "assistant", content: fullResponse },
      ];
      setHistory(newHistory);

      // Apply file edits from AI response
      if (hasAttachments && onFileUpdate) {
        const blocks = extractFileBlocks(fullResponse);
        for (const block of blocks) {
          if (attachedPaths.includes(block.path)) {
            onFileUpdate(block.path, block.content);
          }
        }
      }

    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setUiMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: m.content || "Something went wrong. Please try again.", streaming: false }
              : m
          )
        );
      }
    } finally {
      setUiMessages(prev => {
        const finalMsgs = prev.map(m =>
          m.id === assistantId ? { ...m, streaming: false } : m
        );
        if (newHistory !== history) {
          persistSession(sid, finalMsgs, newHistory);
          if (minimizedRef.current) onNewMessage();
        }
        return finalMsgs;
      });
      setStreaming(false);
    }
  }, [ai, attachedFiles, currentId, history, input, onNewMessage, persistSession, streaming]);

  // ── Session management ─────────────────────────────────────────────────────

  const openSession = (s: SavedSession) => {
    abortRef.current?.abort();
    setCurrentId(s.id);
    setHistory(s.history);
    setUiMessages(s.uiMessages);
    setStreaming(false);
    setShowHistory(false);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(prev => { const next = prev.filter(s => s.id !== id); writeSessions(next); return next; });
    if (currentId === id) startNewChat();
  };

  const startNewChat = () => {
    abortRef.current?.abort();
    setCurrentId(null);
    setHistory([]);
    setAttachedFiles([]);
    setMentionQuery(null);
    setUiMessages([{ id: genId(), role: "assistant", content: "New chat started. How can I help?" }]);
    setStreaming(false);
    setShowHistory(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionMatches.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); selectMention(mentionMatches[mentionIndex]); return; }
      if (e.key === "Escape")    { e.preventDefault(); setMentionQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Minimized bar ──────────────────────────────────────────────────────────

  if (minimized) {
    return (
      <div className={`chat-panel-minimized${streaming ? " streaming" : ""}`}>
        <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>💬</span>
        <span className="chat-minimized-title">Archiviz AI</span>
        {streaming && (
          <div className="chat-minimized-dots">
            <span /><span /><span />
          </div>
        )}
        {/* spacer */}
        <span style={{ flex: 1 }} />
        <button className="chat-min-btn" onClick={onMaximize} title="Expand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button className="chat-min-btn" onClick={onClose} title="Close">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    );
  }

  // ── Full panel ─────────────────────────────────────────────────────────────

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15 }}>💬</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>
            {showHistory ? "Chat history" : "Archiviz AI"}
          </span>
          {!ai && !showHistory && (
            <span style={{ fontSize: 10, color: "#f87171", background: "rgba(239,68,68,0.1)",
              padding: "2px 6px", borderRadius: 4 }}>
              No AI configured
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            className="chat-icon-btn"
            onClick={() => setShowHistory(v => !v)}
            title={showHistory ? "Back to chat" : "Chat history"}
            style={{ color: showHistory ? "var(--accent)" : undefined, fontSize: 14 }}
          >
            {showHistory ? "←" : "☰"}
          </button>
          {!showHistory && (
            <button className="chat-icon-btn" onClick={startNewChat} title="New chat">✏️</button>
          )}
          <button className="chat-icon-btn" onClick={onMinimize} title="Minimize" style={{ display: "flex", alignItems: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <button className="chat-icon-btn" onClick={onClose}    title="Close">✕</button>
        </div>
      </div>

      {/* Body */}
      {showHistory ? (
        <div className="chat-sessions-list">
          <button className="chat-sessions-new-btn" onClick={startNewChat}>+ New chat</button>
          {sessions.length === 0 ? (
            <div className="chat-sessions-empty">No saved chats yet</div>
          ) : (
            sessions.map(s => (
              <div
                key={s.id}
                className={`chat-session-item ${s.id === currentId ? "active" : ""}`}
                onClick={() => openSession(s)}
              >
                <div className="chat-session-body">
                  <span className="chat-session-title">{s.title}</span>
                  <span className="chat-session-age">{formatAge(s.updatedAt)}</span>
                </div>
                <button className="chat-session-delete" onClick={e => deleteSession(s.id, e)} title="Delete">✕</button>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="chat-messages">
          {uiMessages.map(msg => (
            <div key={msg.id} className={`chat-bubble-row ${msg.role}`}>
              {msg.role === "assistant" && <div className="chat-avatar">A</div>}
              <div className={`chat-bubble ${msg.role}`}>
                {msg.content || (msg.streaming ? "" : "…")}
                {msg.streaming && <span className="chat-typing-cursor" />}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      {!showHistory && (
        <div className="chat-input-area">
          {/* Attached file chips */}
          {attachedFiles.length > 0 && (
            <div className="chat-attached-files">
              {attachedFiles.map(f => (
                <span key={f.path} className="chat-file-chip">
                  <span className="chat-file-chip-name">{f.path.split("/").pop()}</span>
                  <button
                    className="chat-file-chip-remove"
                    onClick={() => removeAttached(f.path)}
                    title={`Remove ${f.path}`}
                  >✕</button>
                </span>
              ))}
            </div>
          )}

          {/* @ mention picker */}
          {mentionQuery !== null && mentionMatches.length > 0 && (
            <div className="chat-mention-list" ref={mentionListRef}>
              {mentionMatches.map((f, i) => (
                <button
                  key={f.path}
                  className={`chat-mention-item${i === mentionIndex ? " active" : ""}`}
                  onMouseDown={e => { e.preventDefault(); selectMention(f); }}
                  onMouseEnter={() => setMentionIndex(i)}
                >
                  <span className="chat-mention-icon">📄</span>
                  <span className="chat-mention-path">{f.path}</span>
                </button>
              ))}
            </div>
          )}

          <div className="chat-input-row">
            <textarea
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={ai ? "Ask anything… type @ to attach a file" : "Configure AI provider first"}
              disabled={!ai || streaming}
              rows={1}
            />
            <button
              className="chat-send-btn"
              onClick={sendMessage}
              disabled={!ai || !input.trim() || streaming}
              title="Send"
            >
              {streaming ? (
                <span className="chat-spinner" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
