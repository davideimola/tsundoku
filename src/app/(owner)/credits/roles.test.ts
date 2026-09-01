import { describe, expect, it } from "vitest";
import { rolesSaid } from "./roles.ts";

// A screen's own derivation, tested beside itself under the licence `vitest.config.ts`
// states: data in, data out, and this application would still have it if React were
// replaced. What it pins is the separator — three screens say a set of roles, and the
// picker's row is drawn on the server so that it says the same thing as the other two.

describe("roles said in one line", () => {
  it("joins them in the order they arrive, which is the order a comic is credited in", () => {
    expect(rolesSaid([{ name: "Writer" }, { name: "Artist" }])).toBe("Writer · Artist");
  });

  it("is the name alone where there is one role", () => {
    expect(rolesSaid([{ name: "Artist" }])).toBe("Artist");
  });

  it("says nothing for nobody's roles, because a person with none is credited by nothing", () => {
    expect(rolesSaid([])).toBe("");
  });
});
