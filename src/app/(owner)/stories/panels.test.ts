import { describe, expect, it } from "vitest";

import {
  carriedAs,
  IMAGE,
  NOTHING_ON_IT,
  PUBLISHES,
  REACHED,
  RENAME,
  SERIALIZE,
  STRIKE,
  STRIKE_OUTCOME,
  STRIKE_PASS,
  STRIKE_RATING,
  THE_WALLS_FILTERS,
} from "./panels";

// The Story wall's addresses, tested beside themselves under the licence `vitest.config.ts`
// states: data in, data out, a function this application would still have if React were
// replaced.
//
// **It exists because of a bug #33 wrote and caught in the rendered HTML.** The wall narrows
// by Type; the panel that recorded a Story asked for a Type; and carrying the filter through
// the form under its own name put two fields called `type` in one form. `FormData.get` answers
// with the first, so the *filter* would have won: a wall narrowed to Manga records a Comic as a
// Manga, silently, on a record that is then permanent. That panel is the one door's now (#45)
// and the rule outlived it, which is why the prefix is still here and still asserted — the next
// form on this wall asking for something the wall also narrows by would write the bug again.
// Nothing types that mistake: both names are strings that are correct on their own and wrong
// only in relation to each other, which is the whole argument `panels.ts` makes about itself.

describe("carrying the wall's filters through the form", () => {
  it("never sends a filter under a name the form itself could be using", () => {
    for (const filter of THE_WALLS_FILTERS) {
      expect(carriedAs(filter)).not.toBe(filter);
    }
  });

  // Named on its own, because this is the collision that actually happened rather than a
  // property somebody might read as theoretical.
  it("keeps the Type filter apart from the Type the Story is", () => {
    expect(carriedAs("type")).not.toBe("type");
  });

  it("gives each filter its own name, so two of them cannot arrive as one", () => {
    const carried = THE_WALLS_FILTERS.map(carriedAs);

    expect(new Set(carried).size).toBe(carried.length);
  });

  // **Every name this file exports**, the three destructive ones included. They were left out
  // while there were two of them and that was already the wrong list: a slug shared between
  // any two strikes is the one collision this whole file exists to make impossible, and there
  // are three now (ADR-0024) — `strike`, `strike-pass` and `strike-outcome` are one typo from
  // each other, and each unmakes a different record.
  const THE_PANELS = [
    NOTHING_ON_IT,
    STRIKE,
    STRIKE_PASS,
    STRIKE_RATING,
    STRIKE_OUTCOME,
    SERIALIZE,
    REACHED,
    PUBLISHES,
    RENAME,
    IMAGE,
  ];

  // A panel's name reaches the URL, so a space or an ampersand in it is a drawer that opens
  // on the way out of one browser and not the other.
  it("names each panel as a plain slug", () => {
    for (const panel of THE_PANELS) {
      expect(panel).toMatch(/^[a-z-]+$/);
    }
  });

  // A bulk delete and nine forms. One name shared between any two of them would open the
  // destructive one where the owner asked for something else entirely — and the rename now
  // stands in the same strip as the strike, which is where that mistake would be cheapest to
  // make and worst to have made.
  it("gives each panel its own name", () => {
    expect(new Set(THE_PANELS).size).toBe(THE_PANELS.length);
  });
});
