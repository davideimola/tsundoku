import { describe, expect, it } from "vitest";

import type { RecordedVolume } from "@/core/queries/collection";

import {
  facedWith,
  THE_STORY_ACT,
  theActsOnTheObject,
  theEditionNoteAct,
  theSplitAct,
  timesSaid,
  whatTheHouseSays,
  whatTheLookupSaid,
  whatWritingAnIsbnDoes,
} from "./standing";

// A screen's own derivation, tested beside itself under the licence `vitest.config.ts` states.
// What it answers is *where the owner stands with one object*, in words.
//
// The case that earns the file is the third one. Being catalogued is not being owned
// (ADR-0007), and **an object that left the house is not an object nobody ever had** — the
// two are told apart by `releasedOn`, and a screen that blurred them would tell the owner
// they never owned the thing they sold. The other half is the vocabulary: *in the house*, not
// *on the shelf*, because `CONTEXT.md` takes that word off the table for the Collection and
// the spine a Series is drawn as already says *in the house*.
//
// **The cover's sentences are the same kind of case** (#32): five states the tile itself
// cannot tell apart, two of which look identical to an owner staring at a blank tile — the
// sources were asked and have none, and nobody has asked. And a source that could not be
// reached is a third thing again, which is the distinction the research this rests on got
// wrong once and produced a false 0% from.

const volume = (standing: Partial<RecordedVolume>): RecordedVolume =>
  ({
    id: "9f2c",
    title: "Death Note Black Edition III",
    publisher: "Planet Manga",
    editionLine: "Black Edition",
    binding: { id: "tankobon", name: "Tankōbon" },
    language: "it",
    pricePaid: null,
    acquiredOn: null,
    isbn: null,
    inTheHouse: false,
    releasedOn: null,
    series: null,
    seriesNumber: null,
    cover: null,
    lookedUp: { source: null, reference: null, infoUrl: null, at: null },
    ...standing,
  }) as RecordedVolume;

/** A record a lookup has reached, and found nothing on. */
const lookedOn = (at: string) => ({ source: null, reference: null, infoUrl: null, at });

describe("where the owner stands with an object", () => {
  it("says it is in the house, from the day it came home", () => {
    expect(whatTheHouseSays(volume({ inTheHouse: true, acquiredOn: "2019-04-02" }))).toBe(
      "In the house, since 2019-04-02."
    );
  });

  it("says so with no day, rather than leaving a blank where a day would be", () => {
    const said = whatTheHouseSays(volume({ inTheHouse: true }));

    expect(said).toContain("In the house");
    expect(said).toContain("nobody wrote down");
  });

  it("tells one that left the house apart from one that was never in it", () => {
    const letGo = whatTheHouseSays(volume({ releasedOn: "2024-01-05" }));
    const neverHere = whatTheHouseSays(volume({}));

    expect(letGo).toContain("Left the house on 2024-01-05");
    expect(neverHere).toContain("Catalogued");
    expect(neverHere).not.toContain("Left the house");
  });

  it("says nothing was erased by the release, because nothing was", () => {
    expect(whatTheHouseSays(volume({ releasedOn: "2024-01-05" }))).toContain("record is kept");
  });

  // The word `CONTEXT.md` takes off the table for the Collection: *shelf*.
  it("never calls the Collection the shelf", () => {
    const everyState = [
      whatTheHouseSays(volume({ inTheHouse: true, acquiredOn: "2019-04-02" })),
      whatTheHouseSays(volume({ inTheHouse: true })),
      whatTheHouseSays(volume({ releasedOn: "2024-01-05" })),
      whatTheHouseSays(volume({})),
    ];

    for (const said of everyState) {
      expect(said.toLowerCase()).not.toContain("shelf");
    }
  });
});

describe("how many times one object was acquired", () => {
  it("uses the word where English has one", () => {
    expect(timesSaid(2)).toBe("twice");
    expect(timesSaid(3)).toBe("three times");
  });

  it("counts past that, because nobody has a word for the seventh time", () => {
    expect(timesSaid(7)).toBe("7 times");
  });
});

describe("what the tile is faced with", () => {
  it("names the source, so an image is never anonymous", () => {
    expect(facedWith(volume({ cover: { url: "https://x/y", from: "google-books" } }))).toContain(
      "Google Books"
    );
    expect(facedWith(volume({ cover: { url: "https://x/y", from: "open-library" } }))).toContain(
      "Open Library"
    );
    expect(facedWith(volume({ cover: { url: "https://x/y", from: "own" } }))).toContain(
      "of your own"
    );
  });

  // The three blank tiles, which look identical on the wall and are three different facts.
  it("tells an established absence from a question nobody asked", () => {
    const asked = facedWith(volume({ isbn: "9788828765431", lookedUp: lookedOn("2026-08-31") }));
    const never = facedWith(volume({ isbn: "9788828765431" }));

    expect(asked).toContain("No source has a cover");
    expect(never).toContain("Nobody has looked");
    expect(asked).not.toBe(never);
  });

  it("says a Volume with no ISBN cannot be asked about at all, rather than that it has none", () => {
    const said = facedWith(volume({ isbn: null }));

    // Every Bonelli monthly is in this state for ever, and the button that would move the
    // other two states can never move this one.
    expect(said).toContain("No ISBN");
    expect(said).not.toContain("Nobody has looked");
  });
});

describe("what one lookup answered", () => {
  it("says a cover arrived, and says an absence is recorded", () => {
    expect(whatTheLookupSaid("found", undefined)).toContain("cover was found");
    expect(whatTheLookupSaid("none", undefined)).toContain("No source has a cover");
    expect(whatTheLookupSaid("unchanged", undefined)).toContain("the same cover");
  });

  // The one this exists for: nothing was written down, so it is not an answer about the book
  // and the owner must not read it as one.
  // *Unchanged* is the answer an owner staring at the wrong book gets when the lookup is
  // working correctly, so it has to point at the ISBN rather than sound like all is well.
  it("sends an unchanged answer at the ISBN, which is the thing that would be wrong", () => {
    const said = whatTheLookupSaid("unchanged", undefined);

    expect(said).toContain("asked again");
    expect(said).toContain("ISBN");
  });

  it("never reads a source that could not be reached as an absence", () => {
    const said = whatTheLookupSaid("unanswered", "Open Library is rate-limiting this address.");

    expect(said).toContain("rate-limiting");
    expect(said).toContain("Nothing was recorded");
    expect(said).not.toContain("No source has a cover");
  });

  it("still says something where the source gave no reason", () => {
    expect(whatTheLookupSaid("unanswered", undefined)).toContain("could not be reached");
  });
});

describe("the acts the object's page offers", () => {
  /** Which panels an object's page would open, in the order the hero stands them in. */
  const panels = (standing: Partial<RecordedVolume>) =>
    theActsOnTheObject(volume(standing)).map((act) => act.panel);

  /** What one of them is called. */
  const labelOf = (standing: Partial<RecordedVolume>, panel: string) =>
    theActsOnTheObject(volume(standing)).find((act) => act.panel === panel)?.label;

  // **The one this file earns its keep on, and it is ADR-0007's third state.** An object
  // that left the house is offered *acquiring it again* and never *releasing it* — the
  // alternative is a page offering to release something the house does not have, which is
  // the blur between being catalogued and being owned made into a button.
  it("offers acquiring one that was never in the house", () => {
    expect(panels({})).toContain("acquire");
    expect(panels({})).not.toContain("release");
  });

  it("offers releasing one that is in the house, and never acquiring it twice over", () => {
    const offered = panels({ inTheHouse: true, acquiredOn: "2019-04-02" });

    expect(offered).toContain("release");
    expect(offered).not.toContain("acquire");
  });

  it("offers acquiring one that left the house, and says it is again", () => {
    const letGo = { releasedOn: "2024-01-05" };

    expect(panels(letGo)).toContain("acquire");
    expect(panels(letGo)).not.toContain("release");
    expect(labelOf(letGo, "acquire")).toContain("again");
  });

  // Whether the house holds the thing is what the owner came to say, so it is the act that
  // leads — and the hero draws the first one loud.
  it("leads with the act about the house, whichever of the two it is", () => {
    expect(panels({})[0]).toBe("acquire");
    expect(panels({ inTheHouse: true })[0]).toBe("release");
  });

  it("asks for an ISBN where there is none and offers to correct the one that stands there", () => {
    expect(labelOf({}, "isbn")).toContain("Record");
    expect(labelOf({ isbn: "9788828765431" }, "isbn")).toContain("Correct");
  });

  // A wrong cover loads perfectly and is a lie (ADR-0013), so the act over one that exists
  // is worded as a change rather than as a search that has already succeeded.
  it("offers to find a cover where there is none and to change the one on the tile", () => {
    expect(labelOf({}, "cover")).toContain("Find");
    expect(labelOf({ cover: { url: "https://x/y", from: "google-books" } }, "cover")).toContain(
      "Change"
    );
  });

  // A Bonelli monthly carries no ISBN and never will, and the panel is where that is said —
  // an act missing from the hero would leave the owner with no way to its own image.
  it("offers the cover even where no source can be asked, because the panel is the answer", () => {
    expect(panels({ isbn: null })).toContain("cover");
  });

  it("names each panel once, so no two acts fight over one address", () => {
    for (const standing of [{}, { inTheHouse: true }, { releasedOn: "2024-01-05" }]) {
      const offered = panels(standing);
      expect(new Set(offered).size).toBe(offered.length);
    }
  });
});

describe("the Edition note's own act", () => {
  it("offers writing one where the owner has written none", () => {
    const act = theEditionNoteAct(null);

    expect(act.panel).toBe("note");
    expect(act.label).toContain("Write");
  });

  it("offers rewriting the one that stands there", () => {
    expect(theEditionNoteAct({ note: "Thin paper.", writtenAt: "2026-08-31" }).label).toContain(
      "Rewrite"
    );
  });

  // The word this application will not use for it, wherever it is printed.
  it("never calls it a Rating", () => {
    const written = { note: "Thin paper.", writtenAt: "2026-08-31" };

    for (const act of [theEditionNoteAct(null), theEditionNoteAct(written)]) {
      expect(act.label.toLowerCase()).not.toContain("rating");
      expect(act.label.toLowerCase()).not.toContain("score");
    }
  });
});

// The fifth act, which is neither in the hero nor a fact about the object. What is worth
// asserting is the address: five panels are named by three different exports, and two of them
// agreeing on a name would be one form standing over another with no error anywhere.
describe("recording a Story from inside the object", () => {
  it("takes an address none of the object's own acts is using", () => {
    for (const standing of [{}, { inTheHouse: true }, { releasedOn: "2024-01-05" }]) {
      const taken = [
        ...theActsOnTheObject(volume(standing)).map((act) => act.panel),
        theEditionNoteAct(null).panel,
      ];

      expect(taken).not.toContain(THE_STORY_ACT.panel);
    }
  });

  // The press beside it in the list also says *record*, and what tells the two apart is that
  // one names a Story and the other makes one exist.
  it("says that the library has not got it, which is the whole of what it adds", () => {
    expect(THE_STORY_ACT.label.toLowerCase()).toContain("not in the library");
  });
});

describe("what writing an ISBN costs", () => {
  const jacket = { url: "https://books.google.com/x", from: "google-books" as const };
  const asked = { source: "google-books", reference: "abc", infoUrl: null, at: "2026-08-31" };

  // **The failure ADR-0012 predicted and production produced**: *One-Punch Man 9* wearing
  // *Slam Dunk 9*'s jacket. `amendVolume` drops the looked-up cover when it writes a
  // different ISBN, and the owner is told so where the correction is made rather than after
  // the tile has changed under them.
  it("says a correction takes the looked-up cover with it", () => {
    const said = whatWritingAnIsbnDoes(
      volume({ isbn: "9788828765431", cover: jacket, lookedUp: asked })
    );

    expect(said).toContain("cover");
    expect(said.toLowerCase()).toContain("wrong book");
  });

  // The looked-up record still goes, but the tile does not change — so the sentence must not
  // warn about an image the owner will still be looking at afterwards.
  it("says an image of the owner's own is left standing", () => {
    const said = whatWritingAnIsbnDoes(
      volume({
        isbn: "9788828765431",
        cover: { url: "https://mine/x.jpg", from: "own" },
        lookedUp: asked,
      })
    );

    expect(said).toContain("your own");
    expect(said).not.toContain("wrong book");
  });

  it("says nothing about covers where no source has ever answered", () => {
    const said = whatWritingAnIsbnDoes(volume({}));

    expect(said.toLowerCase()).not.toContain("cover");
    // An empty box is not a way to empty the field: that is a different act, and there is no
    // verb for it here.
    expect(said).toContain("records nothing");
  });
});

// The sixth act, and the one the screen decides whether to offer. What is asserted is the
// decision rather than the label: an object with no narrative and an object already holding
// several are both presses that could never mean anything, and the verb's own refusals — a
// work other objects carry, a Reading, a Rating — are deliberately *not* second-guessed here.
describe("splitting an object into the Stories it holds", () => {
  const carries = (...titles: string[]) =>
    titles.map((title, at) => ({
      id: `s${at}`,
      title,
      type: { id: "comic", name: "Comic" },
      latestScore: null,
      alsoCarriedElsewhere: false,
      instalments: null,
      covers: null,
    }));

  /** One of twenty tankōbon: the object carries one narrative, and it is not its own. */
  const aVolumeOfAWork = carries("Slam Dunk").map((story) => ({
    ...story,
    alsoCarriedElsewhere: true,
  }));

  it("is offered on an object standing for one narrative, which is what the default makes", () => {
    expect(theSplitAct(carries("Batman: L'uomo che ride"))).toMatchObject({ panel: "split" });
  });

  it("is not offered where there is nothing to split", () => {
    expect(theSplitAct([])).toBeNull();
  });

  it("is not offered on an object that already holds several", () => {
    expect(theSplitAct(carries("Gotham Noir", "Uomo di legno"))).toBeNull();
  });

  // The case that is most of this library once a line is merged: a work across twenty
  // objects is not one volume's to unmake, so the act is not offered rather than refused.
  it("is not offered on one volume of a work other objects carry too", () => {
    expect(theSplitAct(aVolumeOfAWork)).toBeNull();
  });

  it("takes an address none of the object's other acts is using", () => {
    const taken = [
      ...theActsOnTheObject(volume({ inTheHouse: true })).map((act) => act.panel),
      theEditionNoteAct(null).panel,
      THE_STORY_ACT.panel,
    ];

    expect(taken).not.toContain(theSplitAct(carries("Batman: L'uomo che ride"))?.panel);
  });
});
