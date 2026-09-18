import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Settings from "./Settings";
import {
  DEFAULT_DOCKER_SETTINGS,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_GIT_SETTINGS,
  DEFAULT_TERMINAL_SETTINGS,
} from "./defaultSettings";

describe("Settings local AI setup", () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  afterEach(() => vi.unstubAllGlobals());

  it("defaults to private local AI and discovers a recommended model", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ models: [{ name: "qwen2.5-coder:7b" }] }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <Settings
        onSave={vi.fn()}
        theme="black"
        setTheme={vi.fn()}
        colorScheme="dark"
        setColorScheme={vi.fn()}
        editorSettings={DEFAULT_EDITOR_SETTINGS}
        setEditorSettings={vi.fn()}
        terminalSettings={DEFAULT_TERMINAL_SETTINGS}
        setTerminalSettings={vi.fn()}
        dockerSettings={DEFAULT_DOCKER_SETTINGS}
        setDockerSettings={vi.fn()}
        gitSettings={DEFAULT_GIT_SETTINGS}
        setGitSettings={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /aiprovider and model/i }));
    expect(screen.getByRole("button", { name: /free route/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Local / Private", { selector: "strong" })).toBeInTheDocument();

    expect(await screen.findByText("Free Route ready")).toBeInTheDocument();
    expect(screen.getByText(/qwen2.5-coder:7b selected automatically/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("qwen2.5-coder:7b")).toBeInTheDocument();
    expect(screen.getByText(/does not silently fall back/i)).toBeInTheDocument();
  });
});
