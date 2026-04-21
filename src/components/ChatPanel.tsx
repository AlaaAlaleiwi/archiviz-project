import { useState, useRef, useEffect, useCallback } from "react";
import type { AIService, ChatMessage } from "../services/AIService";

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

export default function ChatPanel({ ai, minimized, onMinimize, onMaximize, onClose, onNewMessage }: Props) {
  const [sessions, setSessions]       = useState<SavedSession[]>(readSessions);
  const [currentId, setCurrentId]     = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [uiMessages, setUiMessages]   = useState<UiMessage[]>([WELCOME]);
  const [history, setHistory]         = useState<ChatMessage[]>([]);
  const [input, setInput]             = useState("");
  const [streaming, setStreaming]     = useState(false);

  const abortRef     = useRef<AbortController | null>(null);
  const bottomRef    = useRef<HTMLDivElement>(null);
  // Always reflects current `minimized` prop inside async callbacks
  const minimizedRef = useRef(minimized);
  useEffect(() => { minimizedRef.current = minimized; }, [minimized]);

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

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    if (!ai || !input.trim() || streaming) return;

    const userText    = input.trim();
    const assistantId = genId();
    const sid         = currentId ?? genId();
    if (!currentId) setCurrentId(sid);

    setInput("");
    setStreaming(true);
    setUiMessages(prev => [
      ...prev,
      { id: genId(),    role: "user",      content: userText },
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);

    abortRef.current = new AbortController();

    let newHistory   = history; // local ref — updated on success
    let fullResponse = "";

    try {
      fullResponse = await ai.chatStream(
        history,
        userText,
        (token) => {
          setUiMessages(prev =>
            prev.map(m => m.id === assistantId ? { ...m, content: m.content + token } : m)
          );
        },
        abortRef.current.signal,
      );

      newHistory = [
        ...history,
        { role: "user",      content: userText },
        { role: "assistant", content: fullResponse },
      ];
      setHistory(newHistory);

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
          // Notify parent only if panel is currently minimized
          if (minimizedRef.current) onNewMessage();
        }
        return finalMsgs;
      });
      setStreaming(false);
    }
  }, [ai, currentId, history, input, onNewMessage, persistSession, streaming]);

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
    setUiMessages([{ id: genId(), role: "assistant", content: "New chat started. How can I help?" }]);
    setStreaming(false);
    setShowHistory(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
        <div className="chat-input-row">
          <textarea
            className="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={ai ? "Ask anything… (Enter to send)" : "Configure AI provider first"}
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
      )}
    </div>
  );
}
