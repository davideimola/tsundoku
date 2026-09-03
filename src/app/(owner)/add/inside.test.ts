import { describe, expect, it } from "vitest";

import {
  A_NARRATIVE_WITH_NO_NAME,
  type NamedNarrative,
  theNarrativeAlreadyStanding,
  theNarrativesInside,
  theNarrativesNamedBefore,
  theRowsAfterAdding,
  theRowsAfterMinting,
  theRowsAfterRenaming,
  theRowsAfterTakingOneOff,
  whatIdentifiesARow,
} from "./inside.ts";

// The object half's own derivation, tested beside itself under the licence `vitest.config.ts`
// states: data in, data out, no render and no database. Two of the three things it decides are
// read in both directions here — what the press carries, and what a refused press reads back —
// because they are written by one file and read by another.

// **The default is shown rather than written** (#48, ADR-0019). What used to be a Story minted
// from the volume's title behind the owner's back is now a row standing in a list in front of
// them, and this is the function that decides what that row says.
describe("the narrative an object is shown as holding", () => {
  it("is the work the chosen line publishes, and not a new title", () => {
    expect(
      theNarrativeAlreadyStanding("Slam Dunk 21", { id: "a-story-id", title: "Slam Dunk" })
    ).toEqual({ it: "a-story", storyId: "a-story-id", title: "Slam Dunk" });
  });

  // The case the whole slice is about: the omnibus, the graphic novel and the novel are the
  // only objects the silent default ever reached, and on a novel it is right.
  it("is the volume's own title where the line names no work, or there is no line", () => {
    expect(theNarrativeAlreadyStanding("Neuromancer", null)).toMatchObject({
      it: "a-title",
      title: "Neuromancer",
    });
    expect(theNarrativeAlreadyStanding("Neuromancer", undefined)).toMatchObject({
      it: "a-title",
      title: "Neuromancer",
    });
  });

  it("stands nothing at all where the door has heard no title", () => {
    expect(theNarrativeAlreadyStanding("   ", null)).toBeNull();
  });

  // A line wins over the title even before a title is typed, because the arrow is a fact about
  // the object in front of the owner and the title is what they are still deciding.
  it("lets the line answer even with nothing typed", () => {
    expect(theNarrativeAlreadyStanding("", { id: "a-story-id", title: "Slam Dunk" })).toMatchObject(
      { it: "a-story" }
    );
  });
});

describe("what the object half submits about what is inside it", () => {
  it("splits the rows into the Stories to link and the titles to mint", () => {
    expect(
      theNarrativesInside([
        { it: "a-story", storyId: "gotham", title: "Gotham Noir" },
        { it: "a-title", key: "one", title: "L'uomo che ride" },
        { it: "a-title", key: "two", title: "Uomo di legno" },
      ])
    ).toEqual({
      stories: [{ storyId: "gotham", title: "Gotham Noir" }],
      newStories: ["L'uomo che ride", "Uomo di legno"],
    });
  });

  // A row typed over to nothing is a row on its way to saying something else, not a refusal.
  // What is refused is nothing being left at all, and the core says that in its own words.
  it("drops a title with nothing in it, and trims the rest", () => {
    expect(
      theNarrativesInside([
        { it: "a-title", key: "one", title: "   " },
        { it: "a-title", key: "two", title: "  Uomo di legno " },
      ])
    ).toEqual({ stories: [], newStories: ["Uomo di legno"] });
  });

  it("says the same narrative once however many rows say it", () => {
    expect(
      theNarrativesInside([
        { it: "a-story", storyId: "gotham", title: "Gotham Noir" },
        { it: "a-story", storyId: "gotham", title: "Gotham Noir" },
        { it: "a-title", key: "one", title: "Uomo di legno" },
        { it: "a-title", key: "two", title: "uomo di legno" },
      ])
    ).toEqual({
      stories: [{ storyId: "gotham", title: "Gotham Noir" }],
      newStories: ["Uomo di legno"],
    });
  });

  // The two directions are one list, and they are written and read by two different files: a
  // refused press that lost an omnibus's three tales would answer the owner by asking for the
  // most expensive thing on the screen again.
  it("comes back off a refused press as the rows it was", () => {
    const named = [
      { it: "a-story", storyId: "gotham", title: "Gotham Noir" },
      { it: "a-title", key: "one", title: "Uomo di legno" },
    ] as const;

    const sent = theNarrativesInside(named);
    const back = theNarrativesNamedBefore(
      sent.stories.map((one) => one.storyId),
      sent.stories.map((one) => one.title),
      sent.newStories
    );

    expect(theNarrativesInside(back)).toEqual(sent);
    expect(back).toMatchObject([
      { it: "a-story", storyId: "gotham", title: "Gotham Noir" },
      { it: "a-title", title: "Uomo di legno" },
    ]);
  });

  it("reads a row back under a name rather than under an id where the pair came apart", () => {
    expect(theNarrativesNamedBefore(["gotham"], [], [])).toEqual([
      { it: "a-story", storyId: "gotham", title: A_NARRATIVE_WITH_NO_NAME },
    ]);
  });
});

// **The four acts the list performs**, which are what the component draws and never decides.
// They are here rather than in it because a list becoming another list is data in and data out,
// and `vitest.config.ts` is explicit: a client component may hold no derivation.
describe("the acts on the list", () => {
  const gotham: NamedNarrative = { it: "a-story", storyId: "gotham", title: "Gotham Noir" };
  const own: NamedNarrative = {
    it: "a-title",
    key: "the-volumes-own-title",
    title: "Il lungo Halloween",
  };

  /** One band, as the field answers with it. */
  const found = [
    {
      name: "Slam Dunk",
      seriesId: "a-line",
      stories: [
        {
          id: "one",
          title: "Slam Dunk 1",
          type: { id: "manga", name: "Manga" },
          series: { id: "a-line", name: "Slam Dunk", editionLine: null },
          standsAt: 1,
        },
        {
          id: "two",
          title: "Slam Dunk 2",
          type: { id: "manga", name: "Manga" },
          series: { id: "a-line", name: "Slam Dunk", editionLine: null },
          standsAt: 2,
        },
      ],
    },
  ];

  it("names a row off the answer the owner pressed, and takes a whole band in one press", () => {
    expect(theRowsAfterAdding([own], ["one", "two"], found)).toEqual([
      own,
      { it: "a-story", storyId: "one", title: "Slam Dunk 1", type: "Manga" },
      { it: "a-story", storyId: "two", title: "Slam Dunk 2", type: "Manga" },
    ]);
  });

  it("does not say the same narrative twice", () => {
    expect(theRowsAfterAdding([gotham], ["gotham"], found)).toEqual([gotham]);
  });

  // An id the owner pressed is a narrative they meant, so it stands under a name rather than
  // being dropped. It takes an answer going stale between the press and this to arrive.
  it("keeps a row whose name it was never told", () => {
    expect(theRowsAfterAdding([], ["nowhere"], found)).toEqual([
      { it: "a-story", storyId: "nowhere", title: A_NARRATIVE_WITH_NO_NAME, type: undefined },
    ]);
  });

  it("adds a narrative the library does not hold under its own key", () => {
    expect(theRowsAfterMinting([gotham], "named-1", "Uomo di legno")).toEqual([
      gotham,
      { it: "a-title", key: "named-1", title: "Uomo di legno" },
    ]);
  });

  it("takes off whichever kind of row was pressed", () => {
    expect(theRowsAfterTakingOneOff([gotham, own], "gotham")).toEqual([own]);
    expect(theRowsAfterTakingOneOff([gotham, own], "the-volumes-own-title")).toEqual([gotham]);
  });

  it("empties the list, which is the press the core refuses", () => {
    expect(theRowsAfterTakingOneOff([own], "the-volumes-own-title")).toEqual([]);
  });

  // Renaming reaches a title and never a Story: correcting the name of a narrative the library
  // holds is an Amendment on the narrative itself (ADR-0011).
  it("types over a title and leaves a Story exactly as it stands", () => {
    expect(theRowsAfterRenaming([gotham, own], "the-volumes-own-title", "Il ventriloquo")).toEqual([
      gotham,
      { it: "a-title", key: "the-volumes-own-title", title: "Il ventriloquo" },
    ]);
    expect(theRowsAfterRenaming([gotham], "gotham", "Something else")).toEqual([gotham]);
  });

  it("identifies a Story by the Story and a title by its key", () => {
    expect(whatIdentifiesARow(gotham)).toBe("gotham");
    expect(whatIdentifiesARow(own)).toBe("the-volumes-own-title");
  });
});
