import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { McpTool } from "../tool.ts";
import { THE_PASS_MAY_ALREADY_BE_THERE } from "./pass.ts";

// The vocabulary wall over this door, and it sits beside the Pass area because that is the
// area the rename is named after (#59, ADR-0021).
//
// A **Reading** was *one act of reading a Story*, which a videogame is not, and the
// **Reading list** was *what to read next*, half of which is not read. The model says
// **Pass** and **the Pile** now, and this door's tool names and descriptions are the only
// documentation an external reader ever gets: a description is not a label here, it is what
// an assistant decides from. So a tool left saying "Reading" is not a cosmetic lapse — it
// teaches the assistant a word the library stopped holding.
//
// It is `./inbox.test.ts`'s licence and not a third seam: strings in, verdict out, no
// database and nothing rendered. What makes it a wall rather than a spot check is that it
// walks the directory — the directory *is* the tool list (`../README.md`) — so a tool file
// added later is checked without this file being edited.
//
// The walk is a `readdir`, which is exactly what `../tools.ts` refuses to be and for a
// reason that does not reach here: the source tree is not shipped, so the **door** must ask
// the bundler. A test runs against the source tree by definition. What matters is that both
// select the same files, so this asks the same question in the door's own words.
//
// Two things it deliberately does **not** flag. The lowercase `reading` a Story's state
// carries (`to-read`, `reading`, `read`, `abandoned`) is a value the model still has, and
// the ordinary verb *reading* is still what one does to a manga. What the library stopped
// having is the capitalised **noun**, and that is what is checked.

const HERE = fileURLToPath(new URL(".", import.meta.url));

/** `../tools.ts`'s own pattern, so a file this reads is a file the door mounts. */
const AN_AREA = /^[a-z0-9-]+\.ts$/;

const AREAS = readdirSync(HERE)
  .filter((file) => AN_AREA.test(file))
  .sort();

const everyTool: McpTool[] = (
  await Promise.all(
    AREAS.map(async (file) => {
      const area = (await import(/* @vite-ignore */ `./${file}`)) as { default: McpTool[] };
      return area.default;
    })
  )
).flat();

/** Everything this door hands an external reader as prose, per tool. */
function proseOf(tool: McpTool): string {
  return [tool.title, tool.description, JSON.stringify(tool.inputSchema)].join("\n");
}

describe("the door's areas", () => {
  it("are found, so the checks below are not quietly checking nothing", () => {
    expect(AREAS).toContain("pass.ts");
    expect(AREAS).toContain("pile.ts");
    expect(everyTool.length).toBeGreaterThan(20);
  });
});

describe("the five tools named for the old vocabulary", () => {
  // The first four are the renamed ones this describe is about. `pass_media` is not one of
  // them — it is a vocabulary listing added beside `pass_provenances` on the day the media
  // stopped being a pair (#62) — but it is named here rather than filtered out, because what
  // an assistant depends on is *the whole area*, and a tool arriving in it unnoticed is how
  // this list quietly stops being what the connector was added against.
  it("are the Pass area, under the new names", async () => {
    const pass = (await import("./pass.ts")).default;
    expect(pass.map((tool) => tool.name)).toEqual([
      "pass_record",
      "pass_finish",
      "pass_abandon",
      "pass_provenances",
      "pass_media",
    ]);
  });

  it("are the Pile area, under the new name", async () => {
    const pile = (await import("./pile.ts")).default;
    expect(pile.map((tool) => tool.name)).toEqual(["pile_next"]);
  });

  // **The Pile an external reader is handed crosses every Type in one call, and there is no
  // way to ask it not to** (#64, ADR-0021). Narrowing by Type is the owner's, on their own
  // screen, because they have often already decided what tonight is; an assistant weighing
  // three unread manga against twelve unplayed games needs the one arrears, and a filter here
  // is how it would come to ask about half of it and report the half as the whole.
  it("hand the Pile over whole, with no way to ask for one Type of it", async () => {
    const [next] = (await import("./pile.ts")).default;

    expect(next.inputSchema.properties ?? {}).toEqual({});
    expect(next.inputSchema.additionalProperties).toBe(false);
  });

  it("leave nothing behind under the old names", () => {
    const names = everyTool.map((tool) => tool.name);
    expect(names.filter((name) => name.startsWith("reading"))).toEqual([]);
  });
});

// **THE SECOND WALL OVER THIS AREA, and it is `./inbox.test.ts`'s argument arriving a second
// time.** There the failure was an assistant proposing duplicates although every tool needed to
// avoid one had shipped; here it is an assistant recording a **second Pass** to hang a score on
// although `stories_find` has always answered with the first and `rating_set` has always taken
// its id. Reported from production: the owner said they had read something, said later what
// they thought of it, and the library came to claim they went through it twice and judged only
// the second time.
//
// The remedy is the one this door has already been made to pay for: **one instruction, in one
// place, spent by every tool that can produce the failure** — never a nuance each description
// words its own way, because the weakest wording is the one an assistant finds a way to read as
// permission. So `THE_PASS_MAY_ALREADY_BE_THERE` is declared in `./pass.ts` and this is what
// holds both spenders to it.
//
// A third tool that records a Pass, or a second that writes a judgement, is the case this
// exists to catch: it will fail here until it spends the sentence rather than restating it.
describe("a score does not make a Pass that never happened", () => {
  /** The two tools that between them can produce the failure. */
  async function theSpenders(): Promise<McpTool[]> {
    const pass = (await import("./pass.ts")).default;
    const rating = (await import("./rating.ts")).default;

    return [
      ...pass.filter((tool) => tool.name === "pass_record"),
      ...rating.filter((tool) => tool.name === "rating_set"),
    ];
  }

  it("finds both of them, so this is not checking nothing", async () => {
    expect((await theSpenders()).map((tool) => tool.name)).toEqual(["pass_record", "rating_set"]);
  });

  it("says the instruction in both, in the same words", async () => {
    for (const tool of await theSpenders()) {
      expect(tool.description).toContain(THE_PASS_MAY_ALREADY_BE_THERE);
    }
  });

  // The sentence is only worth anything if it names the tool that answers the question. An
  // instruction to *check first* with nowhere to check is the shape of advice an assistant
  // skips.
  it("names where the existing Pass is found", () => {
    expect(THE_PASS_MAY_ALREADY_BE_THERE).toContain("stories_find");
  });

  // It says what a second Pass **means** rather than forbidding one: a reread is ordinary, and
  // a door that made recording one awkward would have traded this failure for a worse one.
  it("does not forbid a second Pass, because rereading is ordinary", () => {
    expect(THE_PASS_MAY_ALREADY_BE_THERE).toMatch(/reread/i);
  });

  // And the argument that carries the id has to point at the same place, because that is the
  // field an assistant actually fills in.
  it("sends rating_set's own pass argument to the same tool", async () => {
    const [, rating] = await theSpenders();
    const pass = (rating.inputSchema.properties as Record<string, { description?: string }>).pass;

    expect(pass?.description).toContain("stories_find");
  });
});

// **The rule that makes the door's refusal reachable at all**, and it belongs on the directory
// walk rather than beside any one tool. `protocol.ts` refuses an argument a tool does not
// declare — which is what turns a stale tool list from a silently wrong record into one
// sentence — but it can only do that where the schema says `additionalProperties: false`. A
// tool that left it out would opt itself back into the silence, and nothing else would notice.
describe("every tool closes its arguments", () => {
  it.each(everyTool.map((tool) => [tool.name, tool] as const))(
    "%s says additionalProperties: false",
    (_name, tool) => {
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
  );
});

describe("every sentence the door hands an external reader", () => {
  it.each(everyTool.map((tool) => [tool.name, tool] as const))(
    "%s never names a Reading",
    (_name, tool) => {
      // The capitalised noun, singular or plural, and the old list beside it.
      expect(proseOf(tool)).not.toMatch(/\bReadings?\b/);
      expect(proseOf(tool)).not.toMatch(/reading list/i);
    }
  );

  it.each(everyTool.map((tool) => [tool.name, tool] as const))(
    "%s never sends the assistant to a tool that no longer exists",
    (_name, tool) => {
      expect(proseOf(tool)).not.toContain("reading_");
    }
  );

  it.each(everyTool.map((tool) => [tool.name, tool] as const))(
    "%s asks for no argument called a reading",
    (_name, tool) => {
      expect(Object.keys(tool.inputSchema.properties ?? {})).not.toContain("reading");
    }
  );
});
