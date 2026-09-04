import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { recordPass } from "../verbs/pass.ts";
import { createStory } from "../verbs/story.ts";
import { openWant, strikeWant } from "../verbs/want.ts";
import { listOpenWants, theWantOnTheStory } from "./want.ts";

// Seam 1, the read side of the Want — and everything asserted here is a derivation with no
// row behind it: whether a Want is still open, and the one order a Want has.

beforeEach(async () => {
  await query("truncate story cascade");
});

describe("the open Wants", () => {
  it("names the Story and what kind of thing it is, which is all a Want carries", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });
    await openWant(storyId);

    expect(await listOpenWants()).toMatchObject([
      { story: { id: storyId, title: "Slam Dunk", type: { id: "manga", name: "Manga" } } },
    ]);
  });

  it("reads newest first, which is the only order a Want has", async () => {
    const first = await createStory({ title: "Vagabond", typeId: "manga" });
    const second = await createStory({ title: "Lone Wolf and Cub", typeId: "manga" });

    await openWant(first);
    await openWant(second);

    expect((await listOpenWants()).map((want) => want.story.title)).toEqual([
      "Lone Wolf and Cub",
      "Vagabond",
    ]);
  });

  it("leaves out the ones a Pass has answered, and keeps the ones it has not", async () => {
    const read = await createStory({ title: "Death Note", typeId: "manga" });
    const wanted = await createStory({ title: "Vagabond", typeId: "manga" });
    await openWant(read);
    await openWant(wanted);

    await recordPass({ storyId: read, medium: "digital", provenanceId: "remembered" });

    expect((await listOpenWants()).map((want) => want.story.title)).toEqual(["Vagabond"]);
  });
});

describe("the Want standing on one Story", () => {
  it("is nothing at all where the owner never said it", async () => {
    const storyId = await createStory({ title: "Vagabond", typeId: "manga" });

    expect(await theWantOnTheStory(storyId)).toBeNull();
    // A hand-typed address carries anything, and the answer is the same absence.
    expect(await theWantOnTheStory("banana")).toBeNull();
  });

  it("is still there once it has fallen quiet, and says so", async () => {
    const storyId = await createStory({ title: "Vagabond", typeId: "manga" });
    const { id } = await openWant(storyId);

    expect(await theWantOnTheStory(storyId)).toMatchObject({ id, quiet: false });

    await recordPass({ storyId, medium: "digital", provenanceId: "remembered" });

    expect(await theWantOnTheStory(storyId)).toMatchObject({ id, quiet: true });
  });

  // **A game wanted and then played**, which is the same two facts one word apart from the
  // manga above — and that is the assertion (#62). *I want to play it* is a Want and nothing
  // else, so nothing had to be built for a game to say it, and a pass through a console
  // answers a Want exactly as a pass on paper does.
  //
  // The second half is user story 9 and it is a game's case far more than a book's: meaning to
  // replay something is ordinary. A Want opened **after** a pass has already ended stands,
  // because quietness is a comparison of moments and not a state anybody writes.
  it("falls quiet on a game once it has been played, and stands again when the owner means to replay it", async () => {
    const storyId = await createStory({ title: "Hades", typeId: "videogame" });
    const wanted = await openWant(storyId);

    await recordPass({
      storyId,
      medium: "nintendo-switch",
      outcome: "finished",
      provenanceId: "remembered",
    });

    expect(await theWantOnTheStory(storyId)).toMatchObject({ id: wanted.id, quiet: true });

    // The one the owner opens today, on the game they finished before it: a Want is one per
    // Story, so the spent one is struck and the new one stands with no later pass to answer it.
    await strikeWant(wanted.id);
    const again = await openWant(storyId);

    expect(await theWantOnTheStory(storyId)).toMatchObject({ id: again.id, quiet: false });
  });
});
