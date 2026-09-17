import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import GenerationPlanModal from "./GenerationPlanModal";

const changes = [
  { path: "Existing.java", kind: "modify" as const, before: "user", after: "generated", selected: true },
  { path: "New.java", kind: "add" as const, before: "", after: "new", selected: true },
];

describe("GenerationPlanModal", () => {
  it("requires explicit selected changes before applying", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<GenerationPlanModal changes={changes} onCancel={vi.fn()} onApply={onApply} />);

    expect(screen.getByRole("dialog", { name: /review generated changes/i })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /existing.java/i }));
    await user.click(screen.getByRole("button", { name: /apply 1 change/i }));

    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply.mock.calls[0][0].find((change: { path: string }) => change.path === "Existing.java").selected).toBe(false);
  });

  it("cancels with Escape and restores control to the caller", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<GenerationPlanModal changes={changes} onCancel={onCancel} onApply={vi.fn()} />);
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
