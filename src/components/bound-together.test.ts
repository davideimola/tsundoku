import { describe, expect, it } from "vitest";
import { boundTogether, type Faced, ownsItsCover } from "./bound-together";

const OMNIBUS = "https://covers.example/omnibus.jpg";
const LOEB_SALE = { id: "loeb-sale", title: "Batman di Jeph Loeb e Tim Sale 1" };

function story(
  id: string,
  cover: Faced["cover"],
  wornBy = 1,
  lentBy: Faced["lentBy"] = null
): Faced {
  return { id, cover, wornBy, lentBy };
}

const lent = (url: string) => ({ url, from: "open-library" as const });

/** A tale out of the Loeb/Sale omnibus, wearing its jacket with two others. */
const tale = (id: string) => story(id, lent(OMNIBUS), 3, LOEB_SALE);

describe("stories bound in one volume", () => {
  it("draws the tales of one omnibus as one tile, where the first of them stood", () => {
    const wall = [
      story("a", null, 0),
      tale("halloween"),
      story("b", lent("https://covers.example/b.jpg"), 1, { id: "b-1", title: "B 1" }),
      tale("vittoria"),
      tale("uomo"),
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

  // The Volume is the one the query named, so the sheet always has a way onto it — held in
  // the house or not, which the wall no longer has to find out by itself.
  it("names the Volume the jacket is lent by", () => {
    const [tile] = boundTogether([tale("halloween"), tale("vittoria")]);

    expect(tile).toMatchObject({ kind: "bound", volume: LOEB_SALE });
  });

  // Grouped by the Volume and not by the picture: two objects faced with one address are two
  // books, and their tales are not bound together.
  it("keeps apart the tales of two Volumes that happen to wear the same image", () => {
    const other = { id: "other", title: "Another omnibus" };
    const tiles = boundTogether([
      tale("halloween"),
      tale("vittoria"),
      story("hush-1", lent(OMNIBUS), 2, other),
      story("hush-2", lent(OMNIBUS), 2, other),
    ]);

    expect(tiles.map((tile) => tile.kind === "bound" && tile.volume.id)).toEqual([
      "loeb-sale",
      "other",
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
    const [tile] = boundTogether([tale("halloween")]);

    expect(tile).toMatchObject({ kind: "one", ownsItsCover: false });
  });

  it("lets a story wear a jacket nobody else wears", () => {
    expect(ownsItsCover(story("slam-dunk", lent("https://covers.example/sd.jpg"), 1))).toBe(true);
    expect(ownsItsCover(story("nothing", null, 0))).toBe(false);
  });
});
