import { describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { recordPass } from "../verbs/pass.ts";
import { createStory } from "../verbs/story.ts";
import { listMedia, theMediaEachTypeOffers, theMediaToOffer } from "./medium.ts";

// Read off `CONTEXT.md`'s Medium entry rather than off the migration, the way the Bindings
// are: if this test and the schema disagree, the glossary is the one that is right. What it
// pins is the two the old check constraint held, the consoles that made a vocabulary of them,
// and the flag that constraint implied — **only paper goes through an object** (ADR-0022).
//
// **The consoles are the owner's own three and the list is meant to move**, which is the
// point of it being data (#62): a console bought next year is one insert and this line, and
// nothing else in the repository names one.
describe("the media", () => {
  it("are a vocabulary in the order they are offered in, and say which goes through an object", async () => {
    expect(await listMedia()).toEqual([
      { id: "paper", name: "Paper", goesThroughAnObject: true },
      { id: "digital", name: "Digital", goesThroughAnObject: false },
      { id: "playstation-5", name: "PlayStation 5", goesThroughAnObject: false },
      { id: "nintendo-switch", name: "Nintendo Switch", goesThroughAnObject: false },
      { id: "pc", name: "PC", goesThroughAnObject: false },
    ]);
  });

  // The rule stated as a rule rather than as a list, so that a console added without the flag
  // fails here rather than at the moment a pass through it is refused an object it should
  // never have been offered. Paper is the only medium that can, and it is the one the
  // sentence is written against (ADR-0022).
  it("lets only paper go through an object, whatever else is seeded beside it", async () => {
    const through = (await listMedia())
      .filter((medium) => medium.goesThroughAnObject)
      .map((medium) => medium.id);

    expect(through).toEqual(["paper"]);
  });
});

// **WHICH MEDIA A TYPE OFFERS** (#63), which is the one thing `CONTEXT.md` says a Type
// decides. It is read off the same vocabulary as the list above and never enumerated here:
// what these assert is the *rule* — what is printed offers the printed pair, what is played
// offers the consoles, and a Type the library has nothing to say about is answered for
// anyway.
describe("the media a Type offers", () => {
  it("offers paper and digital for what is printed", async () => {
    expect((await theMediaToOffer("manga")).map((medium) => medium.id)).toEqual([
      "paper",
      "digital",
    ]);
    expect((await theMediaToOffer("novel")).map((medium) => medium.id)).toEqual([
      "paper",
      "digital",
    ]);
  });

  // And **not** `digital` beside them, which is the absence ADR-0022 argues for: a game
  // carrying a file's medium next to a console would be saying nothing twice.
  it("offers the consoles for what is played, in the vocabulary's own order", async () => {
    expect(await theMediaToOffer("videogame")).toEqual([
      { id: "playstation-5", name: "PlayStation 5", goesThroughAnObject: false },
      { id: "nintendo-switch", name: "Nintendo Switch", goesThroughAnObject: false },
      { id: "pc", name: "PC", goesThroughAnObject: false },
    ]);
  });

  // **The stated fallback, and it is the whole vocabulary rather than an empty picker.** A
  // Type nobody has written a rule for is a Type the owner can still be standing in front of
  // — and the same answer is what the door offers before a Type has been chosen at all, which
  // is what the write with no script running goes through by (ADR-0010).
  it("answers for a Type it has no rule for with every medium there is", async () => {
    await query(
      `insert into type (id, name, display_order) values ('board-game', 'Board game', 99)`
    );

    try {
      expect(await theMediaToOffer("board-game")).toEqual(await listMedia());
    } finally {
      await query(`delete from type where id = 'board-game'`);
    }
  });

  it("answers for no Type at all with every medium there is", async () => {
    expect(await theMediaToOffer(null)).toEqual(await listMedia());
  });

  // The rule stated as a rule: a console inserted into the vocabulary and left out of the
  // mapping is a medium that stands in no picker anywhere, which is a silent failure — the
  // owner buys hardware, the row lands, and nothing changes on either screen.
  it("leaves no medium standing under no Type at all", async () => {
    const offers = await theMediaEachTypeOffers(["manga", "videogame"]);
    const offered = new Set([...offers.manga, ...offers.videogame].map((medium) => medium.id));

    expect(
      [...(await listMedia())].map((medium) => medium.id).filter((id) => !offered.has(id))
    ).toEqual([]);
  });
});

// **The same answer for every Type at once** (#63), and it exists for the reason
// `theTypeEachBindingOffers` does: the Type is a picker standing in the very form the medium
// is asked in, so the screen cannot ask about the Type the owner is about to choose — it is
// handed the whole table and reads off it as the picker turns.
describe("the media each Type offers", () => {
  it("answers for every Type asked about, and for no Type at all", async () => {
    const offers = await theMediaEachTypeOffers(["manga", "videogame"]);

    expect(Object.keys(offers).sort()).toEqual(["", "manga", "videogame"]);
    expect(offers.manga.map((medium) => medium.id)).toEqual(["paper", "digital"]);
    expect(offers.videogame.map((medium) => medium.id)).toEqual([
      "playstation-5",
      "nintendo-switch",
      "pc",
    ]);
    expect(offers[""]).toEqual(await listMedia());
  });

  it("agrees with the one-Type question it is the batch of", async () => {
    const offers = await theMediaEachTypeOffers(["novel", "videogame", "board-game"]);

    expect(offers.novel).toEqual(await theMediaToOffer("novel"));
    expect(offers.videogame).toEqual(await theMediaToOffer("videogame"));
    expect(offers["board-game"]).toEqual(await theMediaToOffer("board-game"));
    expect(offers[""]).toEqual(await theMediaToOffer(null));
  });

  it("answers with nothing extra where it is asked about nothing", async () => {
    expect(Object.keys(await theMediaEachTypeOffers([]))).toEqual([""]);
  });
});

// **Offered is not allowed** (ADR-0022), which is the half of this that lives nowhere in
// code: the mapping above is read by two pickers and by nothing else, and no refusal was
// added anywhere for it. A manga passed through on a PS5 is a sentence the owner is allowed
// to say, because a vocabulary is not a taxonomy and they are the one holding the record.
describe("a medium a Type does not offer", () => {
  it("is recorded all the same when it arrives", async () => {
    await query("truncate story, volume cascade");
    const storyId = await createStory({ title: "One-Punch Man 9", typeId: "manga" });

    await recordPass({
      storyId,
      medium: "playstation-5",
      outcome: "finished",
      provenanceId: "remembered",
    });

    const [pass] = await query<{ medium: string }>(`select medium from pass where story_id = $1`, [
      storyId,
    ]);
    expect(pass.medium).toBe("playstation-5");
  });
});
