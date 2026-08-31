import { describe, expect, it } from "vitest";

import { STYLESHEET_TEXT } from "@/test/palette";
import { cn } from "./utils";

// A test for four lines of glue, and it earns its place for the reason the walls do: what
// it catches is silent. `cn("text-eyebrow", "text-muted-foreground")` compiles, renders,
// and hands the browser a label with a colour and no size — because Tailwind's merger reads
// anything after `text-` that it does not recognise as a *colour*, and drops the size it
// thinks it replaced. The bottom bar of the phone shipped that way.
//
// It is arithmetic over strings: no DOM, no renderer, and no seam of its own.

/** The two sizes the sheet declares, which are the two the merger has to be told about. */
const OURS = ["text-eyebrow", "text-prose"];

describe("the class merger", () => {
  it.each(OURS)("keeps %s when a colour is merged beside it", (size) => {
    const merged = cn(size, "text-muted-foreground");

    expect(merged).toContain(size);
    expect(merged).toContain("text-muted-foreground");
  });

  it("still lets one size replace another", () => {
    expect(cn("text-eyebrow", "text-sm")).toBe("text-sm");
    expect(cn("text-sm", "text-prose")).toBe("text-prose");
  });

  it("still lets one colour replace another", () => {
    expect(cn("text-muted-foreground", "text-foreground")).toBe("text-foreground");
  });

  // The half that keeps the list honest. A size added to the sheet and not to `cn` is the
  // same bug again, one screen further on.
  it("knows every size the stylesheet declares", () => {
    const declared = [...STYLESHEET_TEXT.matchAll(/^\s*--text-([a-z0-9-]+)\s*:/gim)]
      .map(([, name]) => `text-${name}`)
      // `--text-prose--line-height` is the same size's second half, not a size of its own.
      .filter((name) => !name.endsWith("-line-height"));

    expect([...new Set(declared)].sort()).toEqual([...OURS].sort());
  });
});
