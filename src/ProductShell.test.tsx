import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProductShell from "./ProductShell";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue({ ok: true, stdout: "", stderr: "", isRepository: false }) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => undefined) }));

describe("ProductShell", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("introduces the product and its architecture-to-code value", () => {
    render(<ProductShell />);
    expect(screen.getByRole("heading", { name: /turn system design into validated software/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /from an idea to a runnable project/i })).toBeInTheDocument();
    expect(screen.getByText(/architecture decisions become working, testable evidence/i)).toBeInTheDocument();
  });

  it("opens signup and preserves a local-first path into the workspace", async () => {
    const user = userEvent.setup();
    render(<ProductShell />);
    await user.click(screen.getByRole("button", { name: /start building/i }));
    expect(screen.getByRole("heading", { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByText(/cloud accounts and synchronization are not connected yet/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continue without an account/i }));
    expect(await screen.findByRole("heading", { name: /choose a project/i })).toBeInTheDocument();
  });

  it("logs out from the workspace without deleting local project data", async () => {
    const user = userEvent.setup();
    localStorage.setItem("auth_session", JSON.stringify({ id: "user-1", name: "Jane Doe", email: "jane@example.com", passwordHash: "", createdAt: "2026-09-17T00:00:00.000Z" }));
    localStorage.setItem("archiviz_autosave_project", JSON.stringify({ projectName: "Local project" }));
    window.history.replaceState({}, "", "/app");
    render(<ProductShell />);

    await user.click(screen.getByRole("button", { name: /create from description/i }));
    await user.click(screen.getByRole("button", { name: /log out of archiviz/i }));

    expect(screen.getByRole("heading", { name: /turn system design into validated software/i })).toBeInTheDocument();
    expect(localStorage.getItem("auth_session")).toBeNull();
    expect(localStorage.getItem("archiviz_autosave_project")).not.toBeNull();
  });

  it("allows logout before a project is selected", async () => {
    const user = userEvent.setup();
    localStorage.setItem("auth_session", JSON.stringify({ id: "user-1", name: "Jane Doe", email: "jane@example.com", passwordHash: "", createdAt: "2026-09-17T00:00:00.000Z" }));
    window.history.replaceState({}, "", "/app");
    render(<ProductShell />);

    expect(screen.getByRole("heading", { name: /choose a project/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /log out of archiviz/i }));

    expect(screen.getByRole("heading", { name: /turn system design into validated software/i })).toBeInTheDocument();
    expect(localStorage.getItem("auth_session")).toBeNull();
  });
});
