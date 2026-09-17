import { describe, expect, it } from "vitest";
import { parseStackDiagnostics } from "./testOutput";

const FILES = [
  { path: "src/main/java/com/demo/UserService.java", content: "" },
  { path: "src/test/java/com/demo/UserServiceTest.java", content: "" },
];

const SAMPLE = [
  "[ERROR]   UserServiceTest.findAll(UserServiceTest.java:12) expected: <2> but was: <3>",
  "    at com.demo.UserService.findAll(UserService.java:18)",
  "\tat com.demo.UserService$$FastClass0.invoke(FastClass.gen:0)",
  "\tat com.demo.UserServiceTest.findAll(UserServiceTest.java:12)",
  "Caused by: com.demo.NotFoundException (UserService.java:31)",
].join("\n");

describe("parseStackDiagnostics", () => {
  it("maps stack frames to workspace source files by basename", () => {
    const diagnostics = parseStackDiagnostics(SAMPLE, FILES);
    const keys = diagnostics.map(diagnostic => `${diagnostic.path}:${diagnostic.lineNumber}`);
    expect(keys).toContain("src/main/java/com/demo/UserService.java:18");
    expect(keys).toContain("src/test/java/com/demo/UserServiceTest.java:12");
  });

  it("keeps unmatched frames with their raw filename as path", () => {
    const diagnostics = parseStackDiagnostics("\tat other.Lib.call(Lib.java:5)", FILES);
    const found = diagnostics.find(diagnostic => diagnostic.path === "Lib.java");
    expect(found?.lineNumber).toBe(5);
    expect(found?.message).toContain("other.Lib.call");
  });

  it("skips fake/jdk frames and zero lines", () => {
    const diagnostics = parseStackDiagnostics(
      "\tat java.lang.Unsafe.call(Unsafe.java:0)\n\tat bytebuddy.generated(ByteBuddy.java:3)",
      FILES
    );
    expect(diagnostics).toEqual([]);
  });

  it("returns nothing for clean output", () => {
    expect(parseStackDiagnostics("BUILD SUCCESS", FILES)).toEqual([]);
  });
});
