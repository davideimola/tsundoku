import { describe, expect, it } from "vitest";
import type { StoryOnOffer } from "@/core/queries/story-to-volume";
import {
  STANDS_IN_NO_LINE,
  theStoriesOnOffer,
  theWholeBandPress,
  whatEnterDoes,
} from "./stories-on-offer";

const MANGA = { id: "manga", name: "Manga" };
const COMIC = { id: "comic", name: "Comic" };

function of(
  title: string,
  series: StoryOnOffer["series"] = null,
  standsAt: number | null = null
): StoryOnOffer {
  return { id: title, title, type: series ? MANGA : COMIC, series, standsAt };
}

const SLAM_DUNK = { id: "slam-dunk", name: "Slam Dunk", editionLine: null };
const DEATH_NOTE = { id: "death-note", name: "Death Note", editionLine: "Black Edition" };

describe("banding what the field found", () => {
  it("puts the twenty of one line in one band, in the order they arrived", () => {
    const bands = theStoriesOnOffer([
      of("Slam Dunk 1", SLAM_DUNK, 1),
      of("Slam Dunk 2", SLAM_DUNK, 2),
      of("Slam Dunk 10", SLAM_DUNK, 10),
    ]);

    expect(bands).toHaveLength(1);
    expect(bands[0]?.name).toBe("Slam Dunk");
    expect(bands[0]?.stories.map((story) => story.title)).toEqual([
      "Slam Dunk 1",
      "Slam Dunk 2",
      "Slam Dunk 10",
    ]);
  });

  it("keeps the order the bands themselves arrived in, which is the order they are added in", () => {
    const bands = theStoriesOnOffer([
      of("Death Note I", DEATH_NOTE, 1),
      of("Slam Dunk 1", SLAM_DUNK, 1),
      of("Death Note II", DEATH_NOTE, 2),
    ]);

    expect(bands.map((band) => band.name)).toEqual(["Death Note Black Edition", "Slam Dunk"]);
  });

  // Keyed by the Series' **id**: *Fullmetal Alchemist* runs in the standard printing and in
  // the Ultimate Deluxe Edition, and one band of thirty-four would be the screen saying the
  // library holds something it does not.
  it("keeps two editions of one name apart", () => {
    const ultimate = { id: "fma-ultimate", name: "Fullmetal Alchemist", editionLine: "Ultimate" };
    const standard = { id: "fma", name: "Fullmetal Alchemist", editionLine: null };

    const bands = theStoriesOnOffer([of("FMA 1", standard, 1), of("FMA 1 ultimate", ultimate, 1)]);

    expect(bands.map((band) => band.name)).toEqual([
      "Fullmetal Alchemist",
      "Fullmetal Alchemist Ultimate",
    ]);
  });

  it("says a narrative in no line stands in none, rather than calling it other", () => {
    const bands = theStoriesOnOffer([of("Neuromancer"), of("Gotham Noir")]);

    expect(bands).toEqual([expect.objectContaining({ name: STANDS_IN_NO_LINE, seriesId: null })]);
    expect(bands[0]?.stories).toHaveLength(2);
  });

  it("answers nothing with nothing", () => {
    expect(theStoriesOnOffer([])).toEqual([]);
  });
});

// The press that makes twenty rows one gesture, and it carries the number because that is
// the whole of what it promises.
describe("the press over a whole band", () => {
  it("counts what it is about to add", () => {
    const [band] = theStoriesOnOffer([
      of("Slam Dunk 1", SLAM_DUNK, 1),
      of("Slam Dunk 2", SLAM_DUNK, 2),
    ]);

    expect(band && theWholeBandPress(band)).toBe("Add both");
  });

  it("says it plainly for a band of one, because *Add all 1* is not a sentence", () => {
    const [band] = theStoriesOnOffer([of("Neuromancer")]);

    expect(band && theWholeBandPress(band)).toBe("Add it");
  });

  it("names the number for a run", () => {
    const [band] = theStoriesOnOffer(
      Array.from({ length: 20 }, (_, at) => of(`Slam Dunk ${at + 1}`, SLAM_DUNK, at + 1))
    );

    expect(band && theWholeBandPress(band)).toBe("Add all 20");
  });
});

// **What enter does**, which is the one thing in this component that could go two ways and
// so is decided here rather than in a keystroke handler.
describe("enter on what was typed", () => {
  const bands = theStoriesOnOffer([of("Gotham Noir"), of("Uomo di legno")]);

  it("mints a title the library does not hold", () => {
    expect(whatEnterDoes("Il lungo Halloween", bands)).toEqual({
      mint: "Il lungo Halloween",
    });
  });

  // The one case minting would be wrong: the owner typed the whole of a title that is
  // already there, and a second narrative of that name is the duplicate this slice exists to
  // stop being made.
  it("adds the Story the library already holds under that exact title", () => {
    expect(whatEnterDoes("gotham noir", bands)).toEqual({ add: "Gotham Noir" });
  });

  it("mints on a title that only begins one already there, because it is a different title", () => {
    expect(whatEnterDoes("Gotham", bands)).toEqual({ mint: "Gotham" });
  });

  it("takes the surrounding space off before deciding either way", () => {
    expect(whatEnterDoes("  Gotham Noir  ", bands)).toEqual({ add: "Gotham Noir" });
    expect(whatEnterDoes("  Batman  ", bands)).toEqual({ mint: "Batman" });
  });

  it("does nothing at all on an empty field", () => {
    expect(whatEnterDoes("   ", bands)).toBeNull();
  });
});
