import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { findStory } from "../queries/story.ts";
import { isRefusal, type Refusal } from "../refusal.ts";
import { creditStory, uncreditStory } from "./credit.ts";
import { createStory } from "./story.ts";

// Seam 1: the verbs against a real Postgres, asserted through what the owner can see
// afterwards — the Story's Credits — rather than through the rows that were written.
beforeEach(async () => {
  await query("truncate story, person cascade");
});

/** The refusal a call produced, or a failure saying it produced none. */
async function refusalFrom(work: () => Promise<unknown>): Promise<Refusal> {
  try {
    await work();
  } catch (error) {
    if (isRefusal(error)) return error;
    throw error;
  }
  throw new Error("expected a Refusal, and the call succeeded");
}

/** The Credits of a Story, as the Story page and the MCP read of one show them. */
async function creditsOf(storyId: string) {
  const story = await findStory(storyId);
  return story?.credits.map((credit) => `${credit.role.name}: ${credit.person.name}`) ?? [];
}

describe("crediting a Story", () => {
  // The case `CONTEXT.md` names, and the reason the word is Credit and not `author`:
  // one name would have kept the writer and silently dropped the artist.
  it("shows ONE as writer and Yusuke Murata as artist on One-Punch Man", async () => {
    const storyId = await createStory({ title: "One-Punch Man", typeId: "manga" });

    await creditStory({ storyId, person: "ONE", roleId: "writer" });
    await creditStory({ storyId, person: "Yusuke Murata", roleId: "artist" });

    expect(await creditsOf(storyId)).toEqual(["Writer: ONE", "Artist: Yusuke Murata"]);
  });

  it("lets one person hold both roles on the same Story", async () => {
    const storyId = await createStory({ title: "Mob Psycho 100", typeId: "manga" });

    const wrote = await creditStory({ storyId, person: "ONE", roleId: "writer" });
    const drew = await creditStory({ storyId, person: "ONE", roleId: "artist" });

    // One person, so one row in `person` and one id in both Credits: the whole reason a
    // Person is a table is that this is one man and not two names.
    expect(drew.personId).toBe(wrote.personId);
    expect(await creditsOf(storyId)).toEqual(["Writer: ONE", "Artist: ONE"]);
  });

  it("lets two people hold the same role on one Story", async () => {
    const storyId = await createStory({ title: "Gotham Central", typeId: "comic" });

    await creditStory({ storyId, person: "Ed Brubaker", roleId: "writer" });
    await creditStory({ storyId, person: "Greg Rucka", roleId: "writer" });

    expect(await creditsOf(storyId)).toEqual(["Writer: Ed Brubaker", "Writer: Greg Rucka"]);
  });

  it("names a person once whatever case they were typed in", async () => {
    const oneShot = await createStory({ title: "Makai no Ossan", typeId: "manga" });
    const punch = await createStory({ title: "One-Punch Man", typeId: "manga" });

    const first = await creditStory({ storyId: oneShot, person: "ONE", roleId: "writer" });
    const again = await creditStory({ storyId: punch, person: "one", roleId: "writer" });

    expect(again.personId).toBe(first.personId);
    // And the capitalisation they were first credited with is what the screen keeps.
    expect(await creditsOf(punch)).toEqual(["Writer: ONE"]);
  });

  it("refuses the same person in the same role twice on one Story", async () => {
    const storyId = await createStory({ title: "One-Punch Man", typeId: "manga" });
    await creditStory({ storyId, person: "ONE", roleId: "writer" });

    const refusal = await refusalFrom(() =>
      creditStory({ storyId, person: "ONE", roleId: "writer" })
    );

    expect(refusal.code).toBe("already-exists");
    expect(refusal.message).toBe("That person already holds that role on this Story.");
  });

  it("refuses a role the library does not know", async () => {
    const storyId = await createStory({ title: "Watchmen", typeId: "graphic-novel" });

    const refusal = await refusalFrom(() =>
      // The word `CONTEXT.md` forbids, and the database has no row for it.
      creditStory({ storyId, person: "Alan Moore", roleId: "author" })
    );

    expect(refusal.code).toBe("not-found");
    expect(refusal.message).toBe("That is not a role this library credits.");
  });

  it("refuses a blank name", async () => {
    const storyId = await createStory({ title: "Watchmen", typeId: "graphic-novel" });

    const refusal = await refusalFrom(() =>
      creditStory({ storyId, person: "   ", roleId: "writer" })
    );

    expect(refusal.code).toBe("invalid");
    expect(refusal.message).toBe("A Credit needs the name the person is credited with.");
  });

  it("refuses a Story that is not in the library, malformed id or not", async () => {
    const unknown = await refusalFrom(() =>
      creditStory({
        storyId: "00000000-0000-4000-8000-000000000000",
        person: "ONE",
        roleId: "writer",
      })
    );
    expect(unknown.code).toBe("not-found");

    // A story id is generated, so the owner never types one: a malformed id is the same
    // event as an unknown one, and must not reach an adapter as a 500.
    const malformed = await refusalFrom(() =>
      creditStory({ storyId: "banana", person: "ONE", roleId: "writer" })
    );
    expect(malformed.code).toBe("not-found");

    // **And it says what to do instead**, in both branches. Crediting is direct (ADR-0012)
    // and creating the Story it hangs off is not (ADR-0005), so this refusal is where an
    // assistant meets that line: one that only said no would leave it guessing at a door
    // that does not exist.
    for (const refusal of [unknown, malformed]) {
      expect(refusal.message).toBe(
        "That Story is not in the library yet. Propose it, and credit it once it has been approved."
      );
    }
  });

  it("leaves the person standing when a Credit is the wrong one", async () => {
    const punch = await createStory({ title: "One-Punch Man", typeId: "manga" });
    const mob = await createStory({ title: "Mob Psycho 100", typeId: "manga" });
    await creditStory({ storyId: punch, person: "ONE", roleId: "writer" });
    const mistake = await creditStory({ storyId: mob, person: "ONE", roleId: "artist" });

    await uncreditStory(mistake.id);

    expect(await creditsOf(mob)).toEqual([]);
    // The person is still credited elsewhere, which is the point of them being a row:
    // removing one contribution is not forgetting who they are.
    expect(await creditsOf(punch)).toEqual(["Writer: ONE"]);
  });

  it("refuses to remove a Credit that is not there", async () => {
    const refusal = await refusalFrom(() => uncreditStory("00000000-0000-4000-8000-000000000000"));

    expect(refusal.code).toBe("not-found");
    expect(refusal.message).toBe("No Credit has that id.");
  });
});
