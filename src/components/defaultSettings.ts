import type { EditorSettings, DockerSettings, GitSettings, TerminalSettings } from "./Settings";

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  theme: "dark",
  fontFamily: "JetBrains Mono, SF Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 13,
  lineHeight: 21,
  tabSize: 2,
  wordWrap: "off",
  minimap: false,
  lineNumbers: "on",
  renderWhitespace: "selection",
  formatOnPaste: true,
  formatOnType: true,
  smoothScrolling: true,
  cursorStyle: "line",
};

export const DEFAULT_DOCKER_SETTINGS: DockerSettings = {
  enabled: true,
  composeEnabled: true,
  includePostgres: true,
  includeRedis: true,
  imageName: "",
  imageTag: "latest",
  appPort: 8080,
  containerPort: 8080,
  postgresPort: 5432,
  redisPort: 6379,
  maxRamPercentage: 75,
  healthcheckEnabled: true,
};

export const DEFAULT_GIT_SETTINGS: GitSettings = {
  githubToken: "",
  githubUser: null,
};

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  shell: "",
  fontSize: 13,
  fontFamily: '"JetBrains Mono", "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  cursorStyle: "bar",
  cursorBlink: true,
};
