import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Compartment, EditorState, StateEffect, StateField, RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
} from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { basicSetup } from "codemirror";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { markdown } from "@codemirror/lang-markdown";
import { csharp, kotlin } from "@codemirror/legacy-modes/mode/clike";
import { go } from "@codemirror/legacy-modes/mode/go";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { groovy } from "@codemirror/legacy-modes/mode/groovy";
import { oneDark } from "@codemirror/theme-one-dark";
import { linter, type Diagnostic } from "@codemirror/lint";

export type CodeDiagnostic = {
  lineNumber?: number;
  column?: number;
  message?: string;
};

export type CodeDiffLines = { added: number[]; removed: number[] };

export type CodeEditorHandle = {
  revealPosition: (position: { lineNumber: number; column: number }) => void;
};

type Props = {
  path: string;
  value: string;
  language: string;
  dark?: boolean;
  fontSize?: number;
  tabSize?: number;
  wordWrap?: boolean;
  lineNumbers?: boolean;
  readOnly?: boolean;
  diagnostics?: CodeDiagnostic[];
  diffLines?: CodeDiffLines;
  onChange?: (value: string) => void;
  onCtrlClickWord?: (word: string) => void;
};

const EXTENSION_LANGUAGE: Partial<Record<string, Extension>> = {
  java: java(),
  xml: xml(),
  json: json(),
  yaml: yaml(),
  markdown: markdown(),
  kotlin: StreamLanguage.define(kotlin),
  csharp: StreamLanguage.define(csharp),
  go: StreamLanguage.define(go),
  properties: StreamLanguage.define(properties),
  groovy: StreamLanguage.define(groovy),
};

function languageExtension(language: string, path: string): Extension {
  const direct = EXTENSION_LANGUAGE[language];
  if (direct) return direct;

  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (language === "typescript" || language === "javascript") {
    return javascript({
      typescript: language === "typescript" || ext === "tsx",
      jsx: ext === "jsx" || ext === "tsx",
    });
  }
  if (language === "python") return python();
  if (language === "sql") return sql();
  return [];
}

const configCompartment = new Compartment();

const LIVE_LINT_LANGUAGES = new Set([
  "java",
  "kotlin",
  "csharp",
  "go",
  "groovy",
  "typescript",
  "javascript",
  "python",
  "sql",
  "json",
]);

function lintsBalance(language: string) {
  return LIVE_LINT_LANGUAGES.has(language);
}

type ScanState = "code" | "string" | "lineComment" | "blockComment";

function liveLintBalance(text: string, language: string): Diagnostic[] {
  if (language === "json") {
    try {
      JSON.parse(text);
      return [];
    } catch (error) {
      const message = String((error as Error).message ?? error);
      const match = /position (\d+)/.exec(message);
      const from = Math.min(match ? Number(match[1]) : 0, Math.max(text.length - 1, 0));
      return [{
        from,
        to: Math.min(from + 1, text.length),
        message,
        severity: "error" as const,
      }];
    }
  }

  const diagnostics: Diagnostic[] = [];
  const hashLineComments = language === "python";
  const active: { char: string; pos: number }[] = [];
  const closer: Record<string, string> = { "}": "{", ")": "(", "]": "[" };
  const opener: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  let mode: ScanState = "code";
  let stringChar = "";
  let stringStart = 0;

  const pushDiagnostic = (from: number, to: number, message: string, severity: "error" | "warning") => {
    const clampedFrom = Math.max(0, Math.min(from, text.length - 1));
    diagnostics.push({
      from: clampedFrom,
      to: Math.max(clampedFrom + 1, Math.min(to, text.length)),
      message,
      severity,
    });
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (mode === "lineComment") {
      if (char === "\n") mode = "code";
      continue;
    }
    if (mode === "blockComment") {
      if (char === "*" && text[index + 1] === "/") { mode = "code"; index += 1; }
      continue;
    }
    if (mode === "string") {
      if (char === "\\") { index += 1; continue; }
      if (char === stringChar) { mode = "code"; }
      else if (char === "\n") {
        mode = "code";
        pushDiagnostic(stringStart, stringStart + 1, "Unterminated string literal", "warning");
      }
      continue;
    }

    if (!hashLineComments && char === "/" && text[index + 1] === "/") { mode = "lineComment"; continue; }
    if (hashLineComments && char === "#") { mode = "lineComment"; continue; }
    if (char === "/" && text[index + 1] === "*") { mode = "blockComment"; index += 1; continue; }

    if (char === '"' || char === "'" || char === "`") {
      mode = "string";
      stringChar = char;
      stringStart = index;
      continue;
    }

    if (char in opener) {
      active.push({ char, pos: index });
    } else if (char in closer) {
      const top = active.pop();
      if (!top) {
        pushDiagnostic(index, index + 1, `Unmatched '${char}'`, "error");
      } else if (top.char !== closer[char]) {
        pushDiagnostic(top.pos, top.pos + 1, `Expected '${opener[top.char]}' to close but found '${char}'`, "error");
      }
    }
  }

  for (const open of active) {
    pushDiagnostic(open.pos, open.pos + 1, `Unclosed '${open.char}'`, "warning");
  }
  return diagnostics;
}

const ARCHIVIZ_HIGHLIGHT = HighlightStyle.define([
  { tag: t.keyword, color: "#c792ea" },
  { tag: [t.name, t.propertyName], color: "#82aaff" },
  { tag: [t.string, t.special(t.string)], color: "#c3e88d" },
  { tag: [t.number, t.bool, t.null], color: "#f78c6c" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "#637777", fontStyle: "italic" },
  { tag: t.className, color: "#ffcb6b" },
  { tag: t.function(t.variableName), color: "#82aaff" },
  { tag: t.operator, color: "#89ddff" },
  { tag: t.punctuation, color: "#8895a7" },
]);

const errorMark = Decoration.mark({ class: "cm-diagnostic-error" });

const setDiagnosticsEffect = StateEffect.define<CodeDiagnostic[]>();

const addedLineDecoration = Decoration.line({ class: "cm-added-line" });

const setDiffLinesEffect = StateEffect.define<{ added: number[] }>();

const diffLinesField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setDiffLinesEffect)) {
        const builder = new RangeSetBuilder<Decoration>();
        for (const lineNumber of [...effect.value.added].sort((a, b) => a - b)) {
          if (lineNumber < 1 || lineNumber > transaction.state.doc.lines) continue;
          const line = transaction.state.doc.line(lineNumber);
          builder.add(line.from, line.from, addedLineDecoration);
        }
        next = builder.finish();
      }
    }
    return next;
  },
  provide: field => EditorView.decorations.from(field),
});

const diagnosticsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setDiagnosticsEffect)) {
        const builder = new RangeSetBuilder<Decoration>();
        const seenLines = new Set<number>();
        for (const diagnostic of effect.value) {
          if (!diagnostic.lineNumber) continue;
          if (seenLines.has(diagnostic.lineNumber)) continue;
          seenLines.add(diagnostic.lineNumber);
          if (diagnostic.lineNumber > transaction.state.doc.lines) continue;
          const line = transaction.state.doc.line(diagnostic.lineNumber);
          const from = line.from + Math.max(0, (diagnostic.column ?? 1) - 1);
          const to = Math.min(Math.max(from + 1, line.to), line.to);
          if (to > from) builder.add(from, to, errorMark);
        }
        next = builder.finish();
      }
    }
    return next;
  },
  provide: field => EditorView.decorations.from(field),
});

const CodeEditor = forwardRef<CodeEditorHandle, Props>(function CodeEditor(
  {
    path,
    value,
    language,
    dark = true,
    fontSize = 13,
    tabSize = 2,
    wordWrap = true,
    lineNumbers: showLineNumbers = true,
    readOnly = false,
    diagnostics = [],
    diffLines = { added: [], removed: [] },
    onChange,
    onCtrlClickWord,
  },
  ref
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const ctrlClickRef = useRef(onCtrlClickWord);
  const readOnlyRef = useRef(readOnly);

  onChangeRef.current = onChange;
  ctrlClickRef.current = onCtrlClickWord;
  readOnlyRef.current = readOnly;

  useImperativeHandle(
    ref,
    () => ({
      revealPosition(position: { lineNumber: number; column: number }) {
        const view = viewRef.current;
        if (!view) return;
        const doc = view.state.doc;
        const line = doc.line(Math.min(Math.max(position.lineNumber, 1), doc.lines));
        const pos = Math.min(line.from + Math.max(position.column - 1, 0), line.to);
        view.dispatch({
          selection: { anchor: pos },
          effects: EditorView.scrollIntoView(pos, { y: "center" }),
        });
        view.focus();
      },
    }),
    []
  );

  const buildConfig = (): Extension[] => [
    languageExtension(language, path),
    lintsBalance(language) ? linter(view => liveLintBalance(view.state.doc.toString(), language), { delay: 600 }) : [],
    EditorView.editable.of(!readOnlyRef.current),
    EditorState.tabSize.of(tabSize),
    showLineNumbers ? [] : EditorView.theme({ ".cm-gutters": { display: "none" } }),
    wordWrap ? EditorView.lineWrapping : [],
    EditorView.theme({
      "&": { fontSize: `${fontSize}px`, height: "100%" },
      ".cm-scroller": {
        fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
        lineHeight: "1.6",
      },
      ".cm-content": { caretColor: !dark ? "#111827" : "#a5b4fc" },
      ".cm-diagnostic-error": { textDecoration: "underline wavy #ef4444" },
    }),
    dark ? oneDark : syntaxHighlighting(ARCHIVIZ_HIGHLIGHT, { fallback: true }),
  ];

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return;

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          diagnosticsField,
          diffLinesField,
          EditorView.editorAttributes.of({ spellcheck: "false" }),
          EditorView.domEventHandlers({
            mousedown(event, targetView) {
              const handler = ctrlClickRef.current;
              if (!handler || !event.ctrlKey && !event.metaKey) return;
              if (event.button !== 0) return;
              const position = targetView.posAtCoords({ x: event.clientX, y: event.clientY });
              if (position == null) return;
              const wordRange = targetView.state.wordAt(position);
              if (!wordRange) return;
              const word = targetView.state.sliceDoc(wordRange.from, wordRange.to);
              if (!word) return;
              event.preventDefault();
              event.stopPropagation();
              handler(word);
            },
          }),
          EditorView.updateListener.of(update => {
            if (update.docChanged && onChangeRef.current) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          configCompartment.of(buildConfig()),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: configCompartment.reconfigure(buildConfig()) });
  }, [path, language, dark, fontSize, tabSize, wordWrap, showLineNumbers, readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() !== value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    }
  }, [value, path]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setDiagnosticsEffect.of(diagnostics) });
  }, [diagnostics]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setDiffLinesEffect.of({ added: diffLines.added }) });
  }, [diffLines]);

  return <div ref={hostRef} className="cm-editor-host" style={{ height: "100%", minHeight: 0 }} />;
});

export default CodeEditor;
