import { describe, expect, it } from "vitest";
import { priceAsTyped } from "./money.ts";
import { isRefusal } from "./refusal.ts";

// **The licensed pure derivation, not a third seam** (`vitest.config.ts`): text the owner
// typed in, text Postgres takes out, and this application would still have it if React and
// `pg` were both replaced. What the *verbs* do with a price is Seam 1.
//
// It is worth its own file because of what it is protecting, which is not arithmetic: the
// numeric keyboard on an Italian phone offers a **comma and no dot**, and the Collection is
// used one-handed in a shop. A price reader that took only a dot is a screen where the owner
// cannot enter what they just paid — and the failure is not an error message, it is a refusal
// that reads like the app calling them wrong.

describe("a price, as the owner typed it", () => {
  it("takes the dot", () => {
    expect(priceAsTyped("6.50")).toBe("6.50");
  });

  // The whole reason this file exists.
  it("takes the comma, because that is what the phone's number pad offers", () => {
    expect(priceAsTyped("6,50")).toBe("6.50");
    expect(priceAsTyped("24,90")).toBe("24.90");
  });

  it("hands Postgres a dot either way, because that is the last place it is still text", () => {
    expect(priceAsTyped("6,5")).toBe("6.5");
    expect(priceAsTyped("15")).toBe("15");
  });

  it("forgives the whitespace a paste brings with it", () => {
    expect(priceAsTyped("  6,50 ")).toBe("6.50");
  });

  // An empty box means *nobody wrote the price down*, which is an ordinary fact about a gift
  // or a book owned since before any of this. It is never zero, which would be a claim.
  it.each([null, undefined, "", "   "])("answers nothing at all for %p", (given) => {
    expect(priceAsTyped(given)).toBeNull();
  });

  it.each([
    ["a currency", "€6,50"],
    ["a currency after it", "6,50 €"],
    ["a thousands mark", "1.234,56"],
    ["both separators", "6.5,0"],
    ["three decimals", "6,505"],
    ["a negative", "-6,50"],
    ["words", "six fifty"],
  ])("refuses %s in prose rather than letting Postgres raise a syntax error", (_, given) => {
    expect(() => priceAsTyped(given)).toThrow();
    try {
      priceAsTyped(given);
    } catch (error) {
      // A `Refusal` and not a stray error: the door renders the prose, and anything else
      // becomes a 500 with the owner's whole entry gone.
      expect(isRefusal(error) && error.code).toBe("invalid");
      expect(isRefusal(error) && error.message).toContain("6,50");
    }
  });
});
