import { describe, expect, it } from "vitest";
import { applyGenerationPlan, createGenerationPlan } from "./generationPlan";

describe("generation plans", () => {
  it("classifies additions and modifications without mutating existing files", () => {
    const existing = [{ path: "A.java", content: "user code" }];
    const plan = createGenerationPlan(existing, [
      { path: "A.java", content: "generated code" },
      { path: "B.java", content: "new code" },
    ]);
    expect(plan.map(change => [change.path, change.kind])).toEqual([
      ["A.java", "modify"],
      ["B.java", "add"],
    ]);
    expect(existing[0].content).toBe("user code");
  });

  it("applies only changes explicitly selected by the user", () => {
    const existing = [{ path: "A.java", content: "user code" }];
    const plan = createGenerationPlan(existing, [
      { path: "A.java", content: "generated code" },
      { path: "B.java", content: "new code" },
    ]);
    plan[0].selected = false;
    expect(applyGenerationPlan(existing, plan)).toEqual([
      { path: "A.java", content: "user code" },
      { path: "B.java", content: "new code" },
    ]);
  });
});
