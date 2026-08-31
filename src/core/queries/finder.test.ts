import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { catalogueVolume } from "../verbs/collection.ts";
import { creditStory } from "../verbs/credit.ts";
import { definePath } from "../verbs/path.ts";
import { declareSeries } from "../verbs/series.ts";
import { createStory } from "../verbs/story.ts";
import { type Finding, FOUND_KINDS, findInTheLibrary } from "./finder.ts";

// Seam 1, and the seam the finder is tested through *instead of* its suggestion list
// (`vitest.config.ts`): the field in the shell is a scripted convenience over this
// function, the `/find` screen is the unscripted twin over the same one, and the MCP
// door's `finder_search` is a third caller of it. What is asserted here is therefore what
// all three answer with, which is the whole reason the query is the seam and the list is
// not.
//
// `person` and `path` join the truncation because this is the first query that reads them
// beside the three walls: a Path left standing from another file is a fifth group in this
// one's answer.
beforeEach(async () => {
  await query("truncate volume, story, series, person, path cascade");
});

function names(findings: Finding[]): string[] {
  return findings.map((finding) => finding.name);
}

/**
 * One record of each of the five kinds, all five answering to one word.
 *
 * Contrived, and it has to be: a Person is a name and nothing else, so there is no
 * arrangement of a real library in which one word reaches a Story, an object, a
 * publisher's line, somebody credited and a route the owner defined. What the fixture is
 * for is the shape of the answer, and the shape is what one field over everything means.
 */
async function oneOfEachKind(): Promise<void> {
  const storyId = await createStory({ title: "Vagabond", typeId: "manga" });
  await volumeInTheHouse({
    title: "Vagabond 1",
    publisher: "Planet Manga",
    binding: "tankobon",
    language: "it",
  });
  await declareSeries({
    name: "Vagabond",
    publisher: "Planet Manga",
    publishedCount: 37,
    status: "concluded",
  });
  await creditStory({ storyId, person: "Vagabondo", roleId: "artist" });
  await definePath({ name: "Rileggere Vagabond" });
}

describe("finding anything in the library", () => {
  beforeEach(oneOfEachKind);

  // The one assertion that says this is a finder and not five searches: one word, and
  // every kind of record that answers to it comes back at once.
  it("answers with a record of every kind that is called it", async () => {
    const found = await findInTheLibrary({ term: "vagabond" });

    expect(found.map((finding) => finding.kind)).toEqual([...FOUND_KINDS]);
  });

  // The order the kinds arrive in is the query's rather than either door's, so that the
  // screen groups without inventing an order and the assistant reads the same one.
  it("names the kinds in one order, and it is the order they arrive in", () => {
    expect(FOUND_KINDS).toEqual(["story", "volume", "series", "person", "path"]);
  });

  it("answers with the record's own id, so a caller can land on it", async () => {
    const [story] = await findInTheLibrary({ term: "vagabond" });
    const [row] = await query<{ title: string }>("select title from story where id = $1", [
      story?.id,
    ]);

    expect(row?.title).toBe("Vagabond");
  });

  // Nothing typed is not "everything": a field the owner has not touched has been asked no
  // question, and answering with the whole library would be a suggestion list nobody
  // opened reading every row there is.
  it.each(["", "   "])("finds nothing when %o was typed", async (term) => {
    expect(await findInTheLibrary({ term })).toEqual([]);
  });

  it("finds nothing that is called something else", async () => {
    expect(await findInTheLibrary({ term: "berserk" })).toEqual([]);
  });
});

// The owner types a word, not a title. Four Volumes into `Slam` is where a finder earns
// its place, and typing the whole of `Ultimate Spider-Man Omnibus 1` is not searching.
describe("a partial name", () => {
  it("finds the record", async () => {
    await createStory({ title: "Jujutsu Kaisen", typeId: "manga" });

    expect(names(await findInTheLibrary({ term: "juju" }))).toEqual(["Jujutsu Kaisen"]);
  });

  it("is matched anywhere in the name, not only at the front", async () => {
    await createStory({ title: "Batman: Il lungo Halloween", typeId: "comic" });

    expect(names(await findInTheLibrary({ term: "lungo" }))).toEqual([
      "Batman: Il lungo Halloween",
    ]);
  });

  it("is matched whatever case it was typed in", async () => {
    await createStory({ title: "Death Note", typeId: "manga" });

    expect(names(await findInTheLibrary({ term: "DEATH" }))).toEqual(["Death Note"]);
    expect(names(await findInTheLibrary({ term: "nOtE" }))).toEqual(["Death Note"]);
  });

  // A name that starts with what was typed is the likelier one, and a suggestion list is
  // five rows long: `Slam Dunk` comes before `Rileggere Slam Dunk` though both match.
  it("puts the names that start with it first", async () => {
    await createStory({ title: "Rileggere Slam Dunk", typeId: "manga" });
    await createStory({ title: "Slam Dunk", typeId: "manga" });

    expect(names(await findInTheLibrary({ term: "slam" }))).toEqual([
      "Slam Dunk",
      "Rileggere Slam Dunk",
    ]);
  });
});

// **Half the names in this library end in a number**, because half of it is a publisher's
// ordered line. Sorted as text, twenty Volumes of one Series read 1, 10, 11, … 2, 20 — which
// is an answer the owner has to re-sort in their head, on the one question the finder is for:
// *is 12 here?*
describe("a name that ends in a number", () => {
  it("is ordered by the number rather than by its first digit", async () => {
    for (const number of [12, 2, 20, 1, 10]) {
      await createStory({ title: `Slam Dunk ${number}`, typeId: "manga" });
    }

    expect(names(await findInTheLibrary({ term: "slam", perKind: 10 }))).toEqual([
      "Slam Dunk 1",
      "Slam Dunk 2",
      "Slam Dunk 10",
      "Slam Dunk 12",
      "Slam Dunk 20",
    ]);
  });

  // The number is a tie-break *within* one name and never above it, so two different titles
  // are still alphabetical: numbering does not reorder the library.
  it("does not reorder two different names", async () => {
    await createStory({ title: "Zorro 1", typeId: "comic" });
    await createStory({ title: "Akira 20", typeId: "manga" });

    expect(names(await findInTheLibrary({ term: "r" }))).toEqual(["Akira 20", "Zorro 1"]);
  });

  it("sorts a name with no number before the numbered ones", async () => {
    await createStory({ title: "Slam Dunk 1", typeId: "manga" });
    await createStory({ title: "Slam Dunk", typeId: "manga" });

    expect(names(await findInTheLibrary({ term: "slam dunk" }))).toEqual([
      "Slam Dunk",
      "Slam Dunk 1",
    ]);
  });
});

// The library is Italian editions of Japanese series, and the keyboard the owner types on
// is not. `unaccent` is applied to **both** sides (`db/migrations/0003_the_finder_folds_accents.sql`),
// so the fold works in either direction and neither one is the special case.
describe("an accent", () => {
  it("is found whether or not it was typed", async () => {
    await createStory({ title: "Perché non sono già morto?", typeId: "non-fiction" });

    for (const term of ["perche", "perché", "PERCHE", "GIA"]) {
      expect(names(await findInTheLibrary({ term }))).toEqual(["Perché non sono già morto?"]);
    }
  });

  // Not only the accents somebody thought to list. A macron is what a hand-kept table of
  // Latin-1 vowels gets wrong, and the people who drew half this library carry one.
  it("is folded beyond the ones a hand-kept list would hold", async () => {
    const storyId = await createStory({ title: "My Hero Academia", typeId: "manga" });
    await creditStory({ storyId, person: "Kōhei Horikoshi", roleId: "writer" });

    expect(names(await findInTheLibrary({ term: "kohei" }))).toEqual(["Kōhei Horikoshi"]);
  });

  it("finds a name that has none where the term carried one", async () => {
    await createStory({ title: "Sapiens", typeId: "non-fiction" });

    expect(names(await findInTheLibrary({ term: "sápiens" }))).toEqual(["Sapiens"]);
  });
});

// A search box takes a word, not a pattern — the same criterion `searchCollection` is held
// to, for the same reason: `%` and `_` are ordinary characters in a title.
describe("a name with a wildcard character in it", () => {
  it("is searched for literally", async () => {
    await createStory({ title: "100% Doraemon", typeId: "manga" });

    expect(names(await findInTheLibrary({ term: "100%" }))).toEqual(["100% Doraemon"]);
    expect(await findInTheLibrary({ term: "%%%" })).toEqual([]);
    expect(await findInTheLibrary({ term: "_oraemon" })).toEqual([]);
  });
});

// What tells two records of one name apart, in the library's own words. It is one column
// off the row rather than a sentence composed here: the words a screen prints are the
// screen's, and a query that composed them would be composing them for the MCP door too.
describe("what a finding is qualified by", () => {
  it("says which Type a Story is", async () => {
    await createStory({ title: "Sapiens", typeId: "non-fiction" });

    expect((await findInTheLibrary({ term: "sapiens" }))[0]?.qualifier).toBe("Non-fiction");
  });

  it("tells two editions of one Volume apart by their Binding", async () => {
    await volumeInTheHouse({
      title: "Batman: Il lungo Halloween",
      publisher: "Panini Comics",
      editionLine: "DC Must Have",
      binding: "must-have",
      language: "it",
    });
    await volumeInTheHouse({
      title: "Batman: Il lungo Halloween",
      publisher: "Panini Comics",
      binding: "paperback",
      language: "it",
    });

    expect(
      (await findInTheLibrary({ term: "halloween" })).map((finding) => finding.qualifier)
    ).toEqual(["Must Have", "Paperback"]);
  });

  // The standard printing before an edition line, which is the order `queries/series.ts`
  // reads two Series of one name in. It is also what makes the answer the same twice: two
  // rows of one name would otherwise be ordered by the ids Postgres generated.
  it("tells two Series of one name apart by their edition line", async () => {
    await declareSeries({
      name: "Berserk",
      publisher: "Panini Comics",
      publishedCount: 42,
      status: "ongoing",
    });
    await declareSeries({
      name: "Berserk",
      publisher: "Panini Comics",
      editionLine: "Deluxe",
      publishedCount: 14,
      status: "ongoing",
    });

    expect(
      (await findInTheLibrary({ term: "berserk" })).map((finding) => finding.qualifier)
    ).toEqual([null, "Deluxe"]);
  });

  it("is nothing for a person or a Path, whose name is the whole of it", async () => {
    await oneOfEachKind();

    expect(
      (await findInTheLibrary({ term: "vagabond" })).map((finding) => [
        finding.kind,
        finding.qualifier,
      ])
    ).toEqual([
      ["story", "Manga"],
      ["volume", "Tankōbon"],
      ["series", null],
      ["person", null],
      ["path", null],
    ]);
  });
});

// **The catalogue, not the Collection** (ADR-0007). A Volume the library knows and the
// house does not hold has a page of its own — the twenty-one on the wishlist, and whatever
// has been let go — and a finder that could not reach it would offer to find records it
// cannot reach.
describe("a Volume the owner does not own", () => {
  it("is still found", async () => {
    await catalogueVolume({
      title: "Blame! 1",
      publisher: "Star Comics",
      binding: "tankobon",
      language: "it",
    });

    expect(names(await findInTheLibrary({ term: "blame" }))).toEqual(["Blame! 1"]);
  });
});

// A suggestion list is five rows and a screen is a page of them, so how many is the
// caller's to say. It is **per kind** rather than over the whole answer, because an owner
// with nine Stories called *Slam Dunk* must still be shown the Series.
describe("how many of each kind come back", () => {
  beforeEach(async () => {
    for (const number of [1, 2, 3, 4, 5, 6, 7]) {
      await createStory({ title: `Slam Dunk ${number}`, typeId: "manga" });
      await volumeInTheHouse({
        title: `Slam Dunk ${number}`,
        publisher: "Planet Manga",
        binding: "tankobon",
        language: "it",
      });
    }
  });

  it("is what the caller asked for, of each kind", async () => {
    const found = await findInTheLibrary({ term: "slam", perKind: 2 });

    expect(found.map((finding) => finding.kind)).toEqual(["story", "story", "volume", "volume"]);
  });

  it("is every one of them where that is what was asked for", async () => {
    expect(await findInTheLibrary({ term: "slam", perKind: 20 })).toHaveLength(14);
  });

  it("is a suggestion list's worth when the caller says nothing", async () => {
    expect(await findInTheLibrary({ term: "slam" })).toHaveLength(10);
  });

  // One rule for every argument that is not a count of rows, rather than a floor for the
  // negatives and something else for `NaN`: a caller asking for none of each kind has
  // asked the wrong question, and a finder answering with nothing would read as a library
  // that holds none of it. `NaN` is the one an assistant can actually send.
  it("is that same few when the number is not a count of rows", async () => {
    for (const perKind of [0, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(await findInTheLibrary({ term: "slam", perKind })).toHaveLength(10);
    }
  });
});
