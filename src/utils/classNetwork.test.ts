import { describe, expect, it } from "vitest";
import { buildClassNetwork, extractClassMethodFlows } from "./classNetwork";

const SAMPLE_JAVA = `package com.example;

import java.util.List;

public class UserService {
    private final UserRepository repo;

    public List<User> findAll() {
        return repo.findAll();
    }

    public User save(User user) {
        return repo.save(user);
    }
}
`;

describe("extractClassMethodFlows", () => {
  it("extracts method names, inputs and outputs from a Java class", () => {
    const flows = extractClassMethodFlows(SAMPLE_JAVA);
    expect(flows.map(flow => flow.name)).toEqual(["findAll", "save"]);
    expect(flows[0].output).toBe("List<User>");
    expect(flows[0].input).toBe("none");
    expect(flows[1].input).toBe("user: User");
  });

  it("handles generic and array return types", () => {
    const flows = extractClassMethodFlows(
      "public class A {\n  public Map<String, List<String>>[] groups() { return null; }\n}"
    );
    expect(flows).toHaveLength(1);
    expect(flows[0].name).toBe("groups");
  });
});

describe("buildClassNetwork", () => {
  it("creates nodes with full file content attached", () => {
    const network = buildClassNetwork(
      [
        { path: "src/main/java/com/example/UserService.java", content: SAMPLE_JAVA },
        { path: "src/main/java/com/example/UserRepository.java", content: "public interface UserRepository {}\n" },
      ],
      "microservice"
    );

    expect(network.nodes).toHaveLength(2);
    expect(network.nodes[0].file.content).toBe(SAMPLE_JAVA);
    expect(network.nodes.map(node => node.name)).toContain("UserService");
  });
});
