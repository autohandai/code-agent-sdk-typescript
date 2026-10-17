import { describe, expect, it } from "bun:test";
import pkg from "../../package.json";

describe("package metadata", () => {
  it("describes the SDK and lists the keywords people search for", () => {
    expect(pkg.description).toBe("Build coding agents on the Autohand agent loop, with any model");
    for (const keyword of ["coding-agent", "ai-agent-sdk", "byok"]) {
      expect(pkg.keywords).toContain(keyword);
    }
    expect(pkg.homepage).toBe("https://autohand.ai/code/sdk/");
  });
});
