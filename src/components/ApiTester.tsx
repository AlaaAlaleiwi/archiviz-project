import { useEffect, useMemo, useState } from "react";
import type { WorkspaceFile } from "./FileWorkspace";
import "../styles.css";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type ApiEndpoint = {
  id: string;
  method: HttpMethod;
  path: string;
  filePath: string;
  handler: string;
  paramsSource: string;
  secured: boolean;
};

type PreparedRequest = {
  path: string;
  paramsText: string;
  headersText: string;
  body: string;
  bodyMode: BodyMode;
  authMode: AuthMode;
};

type ApiHistoryItem = {
  id: string;
  method: HttpMethod;
  url: string;
  status?: number;
  createdAt: string;
};

type ApiResponseState = {
  status: number;
  statusText: string;
  durationMs: number;
  headers: Record<string, string>;
  body: string;
  url?: string;
};

type AuthMode = "none" | "bearer" | "basic";
type BodyMode = "json" | "text" | "none";
type ResponseView = "body" | "headers" | "details";

const API_HISTORY_KEY = "archiviz_api_tester_history";
const METHOD_OPTIONS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const METHOD_ANNOTATIONS: Array<{ method: HttpMethod; annotation: string }> = [
  { method: "GET", annotation: "GetMapping" },
  { method: "POST", annotation: "PostMapping" },
  { method: "PUT", annotation: "PutMapping" },
  { method: "PATCH", annotation: "PatchMapping" },
  { method: "DELETE", annotation: "DeleteMapping" },
];

function stripQuotes(value: string) {
  return value.trim().replace(/^["']|["']$/g, "");
}

function extractAnnotationPath(args = "") {
  const valueMatch = args.match(/(?:value|path)\s*=\s*(\{[^)]*\}|"[^"]*"|'[^']*')/);
  const positionalMatch = args.match(/^\s*(\{[^)]*\}|"[^"]*"|'[^']*')/);
  const raw = valueMatch?.[1] ?? positionalMatch?.[1] ?? "";
  const first = raw.replace(/^\{|\}$/g, "").split(",")[0] ?? "";
  return stripQuotes(first);
}

function joinPaths(prefix: string, path: string) {
  const combined = `/${[prefix, path].filter(Boolean).join("/")}`;
  return combined.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function splitMethodParams(paramsSource: string) {
  const params: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of paramsSource) {
    if (char === "<" || char === "(" || char === "[") depth += 1;
    if (char === ">" || char === ")" || char === "]") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      if (current.trim()) params.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) params.push(current.trim());
  return params;
}

function inferAnnotationName(param: string, annotation: string) {
  const annotated = param.match(new RegExp(`@${annotation}(?:\\s*\\(([^)]*)\\))?`));
  if (!annotated) return null;
  const args = annotated[1] ?? "";
  const explicit = args.match(/(?:value|name)\s*=\s*["']([^"']+)["']/)?.[1]
    ?? args.match(/^["']([^"']+)["']/)?.[1];
  if (explicit) return explicit;

  const cleaned = param
    .replace(/@\w+(?:\([^)]*\))?/g, "")
    .replace(/\b(final|@Nullable|@Valid|@Validated)\b/g, "")
    .trim();
  return cleaned.split(/\s+/).pop()?.replace(/[;,]/g, "") ?? null;
}

function inferRequestBodyType(paramsSource: string) {
  return splitMethodParams(paramsSource).find(param => /@RequestBody\b/.test(param)) ?? "";
}

function javaTypeSample(typeName: string): unknown {
  const normalized = typeName.replace(/[<].*[>]$/, "").replace(/\[\]$/, "").split(".").pop() ?? typeName;
  if (/^(String|UUID|CharSequence)$/.test(normalized)) return "string";
  if (/^(Long|Integer|Short|Byte|BigInteger|int|long|short|byte)$/.test(normalized)) return 0;
  if (/^(Double|Float|BigDecimal|double|float)$/.test(normalized)) return 0.0;
  if (/^(Boolean|boolean)$/.test(normalized)) return true;
  if (/^(List|Set|Collection|Iterable)$/.test(normalized)) return [];
  if (/^(Map|JsonNode|ObjectNode)$/.test(normalized)) return {};
  return {
    id: 0,
    name: "string",
    description: "string",
  };
}

function bodyTemplateFromParam(param: string) {
  const cleaned = param
    .replace(/@\w+(?:\([^)]*\))?/g, "")
    .replace(/\b(final|@Nullable|@Valid|@Validated)\b/g, "")
    .trim();
  const tokens = cleaned.split(/\s+/);
  const typeName = tokens.length > 1 ? tokens[tokens.length - 2] : tokens[0];
  return JSON.stringify(javaTypeSample(typeName), null, 2);
}

function defaultValueForParam(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("page")) return "0";
  if (lower.includes("size") || lower.includes("limit")) return "20";
  if (lower.endsWith("id") || lower === "id") return "1";
  if (lower.includes("email")) return "user@example.com";
  if (lower.includes("sort")) return "id,asc";
  if (lower.includes("enabled") || lower.includes("active")) return "true";
  return "sample";
}

function prepareEndpointRequest(endpoint: ApiEndpoint): PreparedRequest {
  let preparedPath = endpoint.path;
  const params: string[] = [];

  for (const pathVariable of endpoint.path.matchAll(/\{([^}/]+)\}/g)) {
    const name = pathVariable[1];
    preparedPath = preparedPath.replace(`{${name}}`, defaultValueForParam(name));
  }

  for (const param of splitMethodParams(endpoint.paramsSource)) {
    const queryName = inferAnnotationName(param, "RequestParam");
    if (queryName) params.push(`${queryName}=${defaultValueForParam(queryName)}`);
  }

  const bodyParam = inferRequestBodyType(endpoint.paramsSource);
  const hasBody = !!bodyParam && ["POST", "PUT", "PATCH"].includes(endpoint.method);
  const secured = endpoint.secured || /Principal|Authentication|Jwt|SecurityContext|@AuthenticationPrincipal/.test(endpoint.paramsSource);

  return {
    path: preparedPath,
    paramsText: params.join("\n"),
    headersText: [
      "Accept: application/json",
      hasBody ? "Content-Type: application/json" : "",
    ].filter(Boolean).join("\n"),
    body: hasBody ? bodyTemplateFromParam(bodyParam) : "{\n  \n}",
    bodyMode: hasBody ? "json" : "none",
    authMode: secured ? "bearer" : "none",
  };
}

function extractEndpoints(files: WorkspaceFile[]): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];

  for (const file of files) {
    if (!file.path.endsWith(".java")) continue;
    if (!/@(RestController|Controller)\b/.test(file.content)) continue;

    const classRequest = file.content.match(/@RequestMapping\s*\(([^)]*)\)/);
    const classPrefix = extractAnnotationPath(classRequest?.[1] ?? "");

    for (const { method, annotation } of METHOD_ANNOTATIONS) {
      const pattern = new RegExp(`@${annotation}\\s*(?:\\(([^)]*)\\))?([\\s\\S]{0,700}?\\b(?:public|private|protected)?\\s*[\\w<>?,\\s]+\\s+(\\w+)\\s*\\(([^)]*)\\))`, "g");
      for (const match of file.content.matchAll(pattern)) {
        const path = joinPaths(classPrefix, extractAnnotationPath(match[1] ?? ""));
        endpoints.push({
          id: `${method}:${path}:${file.path}:${match.index}`,
          method,
          path,
          filePath: file.path,
          handler: match[3] ?? "handler",
          paramsSource: match[4] ?? "",
          secured: /@(PreAuthorize|Secured|RolesAllowed)\b/.test(match[2] ?? ""),
        });
      }
    }

    const requestPattern = /@RequestMapping\s*\(([^)]*)\)([\s\S]{0,700}?\b(?:public|private|protected)?\s*[\w<>?,\s]+\s+(\w+)\s*\(([^)]*)\))/g;
    for (const match of file.content.matchAll(requestPattern)) {
      const args = match[1] ?? "";
      const methodMatch = args.match(/method\s*=\s*RequestMethod\.(GET|POST|PUT|PATCH|DELETE)/);
      if (!methodMatch) continue;
      const method = methodMatch[1] as HttpMethod;
      const path = joinPaths(classPrefix, extractAnnotationPath(args));
      endpoints.push({
        id: `${method}:${path}:${file.path}:${match.index}`,
        method,
        path,
        filePath: file.path,
        handler: match[3] ?? "handler",
        paramsSource: match[4] ?? "",
        secured: /@(PreAuthorize|Secured|RolesAllowed)\b/.test(match[2] ?? ""),
      });
    }
  }

  const unique = new Map<string, ApiEndpoint>();
  endpoints.forEach(endpoint => unique.set(`${endpoint.method}:${endpoint.path}:${endpoint.handler}`, endpoint));
  return Array.from(unique.values()).sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

function readHistory(): ApiHistoryItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(API_HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch {
    return [];
  }
}

function parseHeaders(value: string) {
  const headers: Record<string, string> = {};
  const trimmed = value.trim();
  if (!trimmed) return headers;

  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    for (const [key, headerValue] of Object.entries(parsed)) {
      headers[key] = String(headerValue);
    }
    return headers;
  }

  for (const line of trimmed.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }

  return headers;
}

function prettyBody(body: string) {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function parseKeyValueLines(value: string) {
  const params: Array<[string, string]> = [];
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.includes("=") ? trimmed.indexOf("=") : trimmed.indexOf(":");
    if (separator <= 0) continue;
    params.push([trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim()]);
  }
  return params;
}

function buildUrl(baseUrl: string, path: string, paramsText: string) {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of parseKeyValueLines(paramsText)) {
    if (key) url.searchParams.set(key, value);
  }
  return url.toString();
}

function byteSize(value: string) {
  return new TextEncoder().encode(value).length;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getContentType(headers: Record<string, string>) {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === "content-type");
  return entry?.[1] ?? "unknown";
}

function headerText(headers: Record<string, string>) {
  return Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join("\n");
}

export default function ApiTester({ files }: { files: WorkspaceFile[] }) {
  const endpoints = useMemo(() => extractEndpoints(files), [files]);
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [baseUrl, setBaseUrl] = useState("http://localhost:8080");
  const [path, setPath] = useState("/api");
  const [paramsText, setParamsText] = useState("");
  const [headersText, setHeadersText] = useState("Content-Type: application/json");
  const [authMode, setAuthMode] = useState<AuthMode>("none");
  const [bearerToken, setBearerToken] = useState("");
  const [basicUser, setBasicUser] = useState("");
  const [basicPassword, setBasicPassword] = useState("");
  const [timeoutMs, setTimeoutMs] = useState(30000);
  const [bodyMode, setBodyMode] = useState<BodyMode>("json");
  const [body, setBody] = useState("{\n  \n}");
  const [response, setResponse] = useState<ApiResponseState | null>(null);
  const [responseView, setResponseView] = useState<ResponseView>("body");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<ApiHistoryItem[]>(readHistory);

  const url = useMemo(() => {
    try {
      return buildUrl(baseUrl, path, paramsText);
    } catch {
      return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
    }
  }, [baseUrl, paramsText, path]);
  const showBody = bodyMode !== "none" && (method === "POST" || method === "PUT" || method === "PATCH");
  const responseBytes = response ? byteSize(response.body) : 0;
  const responseHeaderBytes = response ? byteSize(headerText(response.headers)) : 0;

  useEffect(() => {
    if (endpoints.length > 0 && path === "/api") {
      selectEndpoint(endpoints[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoints, path]);

  const remember = (item: ApiHistoryItem) => {
    setHistory(prev => {
      const next = [item, ...prev.filter(existing => existing.method !== item.method || existing.url !== item.url)].slice(0, 10);
      localStorage.setItem(API_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  };

  const send = async () => {
    setSending(true);
    setError("");
    setResponse(null);

    try {
      const headers = parseHeaders(headersText);
      if (authMode === "bearer" && bearerToken.trim()) {
        headers.Authorization = `Bearer ${bearerToken.trim()}`;
      }
      if (authMode === "basic" && (basicUser || basicPassword)) {
        headers.Authorization = `Basic ${btoa(`${basicUser}:${basicPassword}`)}`;
      }
      if (bodyMode === "json" && showBody && !Object.keys(headers).some(key => key.toLowerCase() === "content-type")) {
        headers["Content-Type"] = "application/json";
      }
      const startedAt = performance.now();
      const request = {
        method,
        url,
        headers,
        body: showBody ? body : undefined,
        timeoutMs,
      };

      const result = window.electronAPI?.sendApiRequest
        ? await window.electronAPI.sendApiRequest(request)
        : await (async () => {
            const res = await fetch(url, {
              method,
              headers,
              body: showBody ? body : undefined,
            });
            return {
              status: res.status,
              statusText: res.statusText,
              durationMs: Math.round(performance.now() - startedAt),
              headers: Object.fromEntries(res.headers.entries()),
              body: await res.text(),
              url: res.url,
            };
          })();

      setResponse(result);
      setResponseView("body");
      remember({
        id: Math.random().toString(36).slice(2),
        method,
        url,
        status: result.status,
        createdAt: new Date().toISOString(),
      });
    } catch (err: any) {
      const message = err?.message ?? "Request failed.";
      setError(message);
      remember({
        id: Math.random().toString(36).slice(2),
        method,
        url,
        createdAt: new Date().toISOString(),
      });
    } finally {
      setSending(false);
    }
  };

  const selectEndpoint = (endpoint: ApiEndpoint) => {
    const prepared = prepareEndpointRequest(endpoint);
    setMethod(endpoint.method);
    setPath(prepared.path);
    setParamsText(prepared.paramsText);
    setHeadersText(prepared.headersText);
    setBody(prepared.body);
    setBodyMode(prepared.bodyMode);
    setAuthMode(prepared.authMode);
    setResponse(null);
    setError("");
  };

  const selectHistory = (item: ApiHistoryItem) => {
    setMethod(item.method);
    try {
      const parsed = new URL(item.url);
      setBaseUrl(`${parsed.protocol}//${parsed.host}`);
      setPath(`${parsed.pathname}${parsed.search}`);
    } catch {
      setPath(item.url);
    }
  };

  const copyResponse = async () => {
    if (!response) return;
    await navigator.clipboard?.writeText(responseView === "headers" ? headerText(response.headers) : response.body);
  };

  return (
    <div className="api-tester">
      <aside className="api-sidebar">
        <div className="api-sidebar-section">
          <div className="workspace-section-title">API Tester</div>
          <div className="api-sidebar-subtitle">Test generated Spring endpoints</div>
        </div>

        <div className="api-sidebar-section">
          <div className="api-list-heading">Detected Endpoints</div>
          <div className="api-endpoint-list">
            {endpoints.length > 0 ? endpoints.map(endpoint => (
              <button
                key={endpoint.id}
                className="api-endpoint-item"
                onClick={() => selectEndpoint(endpoint)}
                title={`${endpoint.filePath} -> ${endpoint.handler}`}
              >
                <span className={`api-method api-method--${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
                <span className="api-endpoint-path">{endpoint.path}</span>
                {endpoint.secured && <span className="api-endpoint-auth">auth</span>}
              </button>
            )) : (
              <div className="workspace-empty">No controller endpoints detected yet.</div>
            )}
          </div>
        </div>

        <div className="api-sidebar-section">
          <div className="api-list-heading">
            <span>History</span>
            {history.length > 0 && (
              <button
                className="api-clear-history"
                onClick={() => {
                  setHistory([]);
                  localStorage.removeItem(API_HISTORY_KEY);
                }}
              >
                Clear
              </button>
            )}
          </div>
          <div className="api-history-list">
            {history.length > 0 ? history.map(item => (
              <button key={item.id} className="api-history-item" onClick={() => selectHistory(item)} title={item.url}>
                <span className={`api-method api-method--${item.method.toLowerCase()}`}>{item.method}</span>
                <span className="api-history-url">{item.url}</span>
                {item.status && <span className="api-history-status">{item.status}</span>}
              </button>
            )) : (
              <div className="workspace-empty">Requests will appear here.</div>
            )}
          </div>
        </div>
      </aside>

      <section className="api-main">
        <div className="api-request-bar">
          <select className="input api-method-select" value={method} onChange={e => setMethod(e.target.value as HttpMethod)}>
            {METHOD_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
          <input className="input api-url-input" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
          <input className="input api-path-input" value={path} onChange={e => setPath(e.target.value)} />
          <button className="btn btn-primary api-send-btn" onClick={send} disabled={sending}>
            {sending ? "Sending..." : "Send"}
          </button>
        </div>

        <div className="api-options-bar">
          <label className="api-inline-field">
            <span>Timeout</span>
            <input
              className="input"
              type="number"
              min={1000}
              max={120000}
              step={1000}
              value={timeoutMs}
              onChange={e => setTimeoutMs(Number(e.target.value) || 30000)}
            />
          </label>
          <label className="api-inline-field">
            <span>Auth</span>
            <select className="input" value={authMode} onChange={e => setAuthMode(e.target.value as AuthMode)}>
              <option value="none">No Auth</option>
              <option value="bearer">Bearer Token</option>
              <option value="basic">Basic Auth</option>
            </select>
          </label>
          <label className="api-inline-field">
            <span>Body</span>
            <select className="input" value={bodyMode} onChange={e => setBodyMode(e.target.value as BodyMode)}>
              <option value="json">JSON</option>
              <option value="text">Text</option>
              <option value="none">None</option>
            </select>
          </label>
        </div>

        {authMode !== "none" && (
          <div className="api-auth-row">
            {authMode === "bearer" ? (
              <input
                className="input"
                type="password"
                value={bearerToken}
                onChange={e => setBearerToken(e.target.value)}
                placeholder="Bearer token"
              />
            ) : (
              <>
                <input className="input" value={basicUser} onChange={e => setBasicUser(e.target.value)} placeholder="Username" />
                <input className="input" type="password" value={basicPassword} onChange={e => setBasicPassword(e.target.value)} placeholder="Password" />
              </>
            )}
          </div>
        )}

        <div className="api-editor-grid api-editor-grid--three">
          <div className="api-card">
            <div className="api-card-header">
              <span>Params</span>
              <small>Name=value lines</small>
            </div>
            <textarea
              className="input api-textarea"
              value={paramsText}
              onChange={e => setParamsText(e.target.value)}
              placeholder={"page=0\nsize=20"}
              spellCheck={false}
            />
          </div>

          <div className="api-card">
            <div className="api-card-header">
              <span>Headers</span>
              <small>JSON or Name: value lines</small>
            </div>
            <textarea
              className="input api-textarea"
              value={headersText}
              onChange={e => setHeadersText(e.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="api-card">
            <div className="api-card-header">
              <span>Body</span>
              <small>{showBody ? `${bodyMode.toUpperCase()} request payload` : "Disabled for this request"}</small>
            </div>
            <textarea
              className="input api-textarea"
              value={body}
              onChange={e => setBody(e.target.value)}
              disabled={!showBody}
              spellCheck={false}
            />
          </div>
        </div>

        <div className="api-response-panel">
          <div className="api-response-header">
            <div>
              <span>Response</span>
              {response && (
                <small>
                  {response.status} {response.statusText} · {response.durationMs}ms · {formatBytes(responseBytes)}
                </small>
              )}
            </div>
            <div className="api-response-actions">
              {response && <button className="api-clear-history" onClick={copyResponse}>Copy</button>}
              {response && <span className={`api-status-pill ${response.status >= 400 ? "error" : "ok"}`}>{response.status}</span>}
            </div>
          </div>

          {error && <div className="api-error">{error}</div>}

          {response ? (
            <>
              <div className="api-response-tabs" role="tablist" aria-label="Response details">
                {(["body", "headers", "details"] as ResponseView[]).map(view => (
                  <button
                    key={view}
                    className={`api-response-tab ${responseView === view ? "active" : ""}`}
                    onClick={() => setResponseView(view)}
                    role="tab"
                    aria-selected={responseView === view}
                  >
                    {view}
                  </button>
                ))}
              </div>

              {responseView === "body" && (
                <pre className="api-response-body api-response-body--full">{prettyBody(response.body)}</pre>
              )}

              {responseView === "headers" && (
                <pre className="api-response-body api-response-body--full">{headerText(response.headers)}</pre>
              )}

              {responseView === "details" && (
                <div className="api-response-details">
                  <div><span>Status</span><strong>{response.status} {response.statusText}</strong></div>
                  <div><span>Duration</span><strong>{response.durationMs}ms</strong></div>
                  <div><span>Body Size</span><strong>{formatBytes(responseBytes)}</strong></div>
                  <div><span>Header Size</span><strong>{formatBytes(responseHeaderBytes)}</strong></div>
                  <div><span>Headers</span><strong>{Object.keys(response.headers).length}</strong></div>
                  <div><span>Content Type</span><strong>{getContentType(response.headers)}</strong></div>
                  <div className="api-response-detail-wide"><span>Request URL</span><strong>{url}</strong></div>
                  {response.url && response.url !== url && (
                    <div className="api-response-detail-wide"><span>Final URL</span><strong>{response.url}</strong></div>
                  )}
                </div>
              )}
            </>
          ) : !error ? (
            <div className="workspace-empty workspace-empty-fill">Send a request to inspect the response.</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
