import { describe, expect, it } from "vitest";

import type { StoryReading } from "@/core/queries/story";

import {
  howItWent,
  readingNow,
  SCORES,
  stillOpen,
  theOpenReading,
  whenItHappened,
} from "./readings";

// A screen's own derivation, tested beside itself under the licence `vitest.config.ts`
// states: data in, data out, and a function this application would still have if React were
// replaced. It holds the **words** a Reading is said in and the one predicate the acts on the
// Story's page hang off — `./story-state.tsx` is the same thing about the Story itself.
//
// The predicate is the reason the file exists rather than the wording. *Started and not
// ended* is what `reading` means, it is what the dashboard's top band is, and it is what
// decides whether the owner is offered *start* or *finish*. Reading it off `outcome` in
// three places would be three chances to disagree about the one state this application is
// named around.

/** A Reading, with only the fields the wording is derived from said out loud. */
function reading(said: Partial<StoryReading> = {}): StoryReading {
  return {
    id: "a-reading",
    medium: "paper",
    outcome: "finished",
    startedOn: null,
    endedOn: null,
    provenance: { id: "remembered", name: "Remembered" },
    rating: null,
    ...said,
  };
}

describe("when a Reading happened", () => {
  it("is the span, where both ends are known", () => {
    expect(whenItHappened(reading({ startedOn: "2021-05-01", endedOn: "2021-06-01" }))).toBe(
      "2021-05-01 → 2021-06-01"
    );
  });

  // Goodreads history routinely carries one date and not the other, and half a span is
  // still a fact about when. Neither half is invented to make a sentence.
  it("is one end, where only one is known", () => {
    expect(whenItHappened(reading({ startedOn: "2021-05-01" }))).toBe("from 2021-05-01");
    expect(whenItHappened(reading({ endedOn: "2021-06-01" }))).toBe("until 2021-06-01");
  });

  // The tense is the whole difference: a Reading that is still open has no end to name, so
  // *since* is what its start means. *From* would say it is over.
  it("is `since` while the Reading is still open", () => {
    expect(whenItHappened(reading({ outcome: null, startedOn: "2026-08-01" }))).toBe(
      "since 2026-08-01"
    );
  });

  it("says so plainly where no date was ever recorded", () => {
    expect(whenItHappened(reading())).toBe("no date recorded");
    expect(whenItHappened(reading({ outcome: null }))).toBe("open, no date recorded");
  });
});

describe("how a Reading went", () => {
  it("is the medium and the outcome", () => {
    expect(howItWent(reading({ medium: "digital", outcome: "abandoned" }))).toBe(
      "digital, abandoned"
    );
  });

  // Not an absent outcome dressed up as one: a Reading with none has not ended, and the
  // words say the act rather than a missing field.
  it("says still reading where there is no outcome yet", () => {
    expect(howItWent(reading({ outcome: null }))).toBe("paper, still reading");
  });
});

describe("the Reading that is open", () => {
  it("is the one that has started and not ended", () => {
    expect(stillOpen(reading({ outcome: null }))).toBe(true);
    expect(stillOpen(reading({ outcome: "finished" }))).toBe(false);
    expect(stillOpen(reading({ outcome: "abandoned" }))).toBe(false);
  });

  // The stack is newest first, and a reread is the ordinary case here: the open one is
  // found among the settled ones rather than assumed to lead.
  it("is found in a stack that has settled Readings above it", () => {
    const open = reading({ id: "the-reread", outcome: null });

    expect(theOpenReading([reading({ id: "finished-in-2021" }), open])?.id).toBe("the-reread");
  });

  // Which is what makes the Story read `to read`, `read` or `abandoned` rather than
  // `reading`, and what puts *start a Reading* in the hero instead of *finish it*.
  it("is nothing at all where every Reading has ended", () => {
    expect(theOpenReading([reading(), reading({ outcome: "abandoned" })])).toBeUndefined();
    expect(theOpenReading([])).toBeUndefined();
  });
});

// What the hero says about the one in the owner's hands. It is *now* rather than a span, and
// a day that was never recorded does not turn into an absence printed mid-sentence.
describe("the Reading in the owner's hands", () => {
  it("says since when, where a day was recorded", () => {
    expect(readingNow(reading({ outcome: null, startedOn: "2026-08-01" }))).toBe(
      "Reading it since 2026-08-01."
    );
  });

  it("says only that it is open, where none was", () => {
    expect(readingNow(reading({ outcome: null }))).toBe("Reading it now.");
  });
});

// The owner's scale, offered rather than typed. A picker cannot produce 7.3 and cannot
// produce a comma, which is the one thing a number field on an Italian phone is full of
// (`src/core/money.ts` is the other half of that story).
describe("the scores the picker offers", () => {
  it("is 1 to 10 in half points, and nothing between them", () => {
    expect(SCORES[0]).toBe(1);
    expect(SCORES.at(-1)).toBe(10);
    expect(SCORES).toHaveLength(19);
    expect(SCORES).toContain(8.5);
    expect(SCORES).not.toContain(0);
  });
});
