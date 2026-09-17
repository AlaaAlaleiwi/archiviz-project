import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
