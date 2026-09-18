import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue({ ok: true, stdout: "", stderr: "", isRepository: false }) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => undefined) }));

describe("Milestone 1 golden-path shell", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(invoke).mockClear();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  afterEach(() => vi.unstubAllGlobals());

  it("auto-configures Free Route without requiring the Settings form", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ models: [{ name: "qwen2.5-coder:7b" }] }),
    } as Response));

    render(<App />);

    await waitFor(() => expect(JSON.parse(localStorage.getItem("ai_settings") ?? "null")).toMatchObject({
      provider: "local",
      routingMode: "free-only",
      baseUrl: "http://localhost:11434",
      model: "qwen2.5-coder:7b",
    }));
  });

  it("repairs an incomplete Free Route configuration automatically", async () => {
    localStorage.setItem("ai_settings", JSON.stringify({
      provider: "local",
      routingMode: "free-only",
      baseUrl: "http://localhost:11434",
      model: "",
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ models: [{ name: "deepseek-coder:latest" }] }),
    } as Response));

    render(<App />);

    await waitFor(() => expect(JSON.parse(localStorage.getItem("ai_settings") ?? "null").model)
      .toBe("deepseek-coder:latest"));
  });

  it("restores the autosaved project after a page refresh", async () => {
    localStorage.setItem("archiviz_project_autosave", JSON.stringify({
      version: 1,
      savedAt: "2026-09-18T10:00:00.000Z",
      projectName: "Restored project",
      javaVersion: "21",
      springBootVersion: "3.4",
      buildTool: "maven",
      prompt: "A restored project",
      graph: { nodes: [], edges: [] },
      nodeCode: {},
      workspaceFiles: [],
    }));

    render(<App />);

    await waitFor(() => expect(screen.queryByRole("heading", { name: /choose a project/i })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Canvas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });

  it("starts from a description and exposes Design, Build, Code, and Ship workspaces", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /create from description/i }));

    expect(screen.getByRole("button", { name: "Canvas" })).toHaveTextContent("Design");
    expect(screen.getByRole("button", { name: "Build workspace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Code editor" })).toHaveTextContent("Code");
    expect(screen.getByRole("button", { name: "Ship workspace" })).toHaveTextContent("Ship");
    expect(screen.getByRole("heading", { name: "Build" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/describe the services/i)).toHaveFocus();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("offers starter templates before a project is created", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /start from template/i }));
    expect(screen.getByRole("dialog", { name: /template library/i })).toBeInTheDocument();
    expect(screen.getByText("REST API with PostgreSQL")).toBeInTheDocument();
    expect(screen.getByText("Spring Boot with React")).toBeInTheDocument();
  });
});
