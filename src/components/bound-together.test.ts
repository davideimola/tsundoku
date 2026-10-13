import { describe, expect, it } from "vitest";
import { boundTogether, type Faced, ownsItsCover } from "./bound-together";

const OMNIBUS = "https://covers.example/omnibus.jpg";

function story(id: string, cover: Faced["cover"], wornBy = 1): Faced {
  return { id, cover, wornBy };
}

const lent = (url: string) => ({ url, from: "open-library" as const });

describe("stories bound in one volume", () => {
  it("draws the tales of one omnibus as one tile, where the first of them stood", () => {
    const wall = [
      story("a", null),
      story("halloween", lent(OMNIBUS), 3),
      story("b", lent("https://covers.example/b.jpg")),
      story("vittoria", lent(OMNIBUS), 3),
      story("uomo", lent(OMNIBUS), 3),
    ];

    const tiles = boundTogether(wall);

    expect(tiles.map((tile) => (tile.kind === "one" ? tile.story.id : `[${tile.key}]`))).toEqual([
      "a",
      "[halloween]",
      "b",
    ]);
    const bound = tiles[1];
    expect(bound.kind === "bound" && bound.stories.map((one) => one.id)).toEqual([
      "halloween",
      "vittoria",
      "uomo",
    ]);
  });

  it("never binds a story wearing a picture of its own", () => {
    const wall = [
      story("one", { url: OMNIBUS, from: "own" }, 1),
      story("two", { url: OMNIBUS, from: "own" }, 1),
    ];

    expect(boundTogether(wall).every((tile) => tile.kind === "one" && tile.ownsItsCover)).toBe(
      true
    );
  });

  it("draws a shared jacket's only tale on this wall as its own cloth", () => {
    const [tile] = boundTogether([story("halloween", lent(OMNIBUS), 3)]);

    expect(tile).toMatchObject({ kind: "one", ownsItsCover: false });
  });

  it("lets a story wear a jacket nobody else wears", () => {
    expect(ownsItsCover(story("slam-dunk", lent("https://covers.example/sd.jpg"), 1))).toBe(true);
    expect(ownsItsCover(story("nothing", null))).toBe(false);
  });
});
