// What the translation of the books tab has to get right, argued against a fixture.
//
// The fixture is fabricated data about real books, in the shape the owner's export has and
// with every case that export turned out to hold: an object described and one that cannot
// be, a pass on paper through a book in the house and one through nothing, a script, an
// ebook, a row nobody has read, a blank spacer row, and a cell naming two writers.
//
// These tests do not open a database. What lands is `write.ts`'s business and the counts in
// `expectations.ts` are what argue about it — asserted against a real Postgres on a real
// run, which is the only place that assertion means anything.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { planBooks, Unreadable } from "./plan.ts";

const FIXTURE = fileURLToPath(new URL("./fixtures/biblioteca.csv", import.meta.url));

describe("the books tab, translated", () => {
  const plan = planBooks(FIXTURE);

  it("reads one Story per row that said something, and skips the blank spacer", () => {
    expect(plan.counted.rows).toBe(7);
    expect(plan.stories).toHaveLength(7);
    expect(plan.stories.map((story) => story.title)).not.toContain("");
  });

  it("gives an object only to a row the sheet can describe one from", () => {
    expect(plan.counted.owned).toBe(5);
    expect(plan.counted.describable).toBe(4);
    expect(plan.counted.undescribable).toBe(1);
    expect(plan.volumes).toHaveLength(4);
    expect(plan.volumes.map((volume) => volume.title)).not.toContain("Le città invisibili");
  });

  it("says why the object it did not write is missing, with the row to fix", () => {
    const said = plan.findings.find((finding) => finding.said.includes("Le città invisibili"));
    expect(said?.line).toBe(4);
    expect(said?.said).toContain("an Editore and a Rilegatura");
  });

  it("keeps being owned and being read unrelated", () => {
    // On the shelf and never opened: a Story, an object, and no Pass invented for it.
    expect(plan.passes.some((pass) => pass.storyKey === "story:4")).toBe(false);
    // Read and not owned: a Pass through nothing at all.
    const zeno = plan.passes.find((pass) => pass.storyKey === "story:7");
    expect(zeno?.medium).toBe("digital");
    expect(zeno?.volumeKey).toBeNull();
  });

  it("sends a paper pass through the object the house holds", () => {
    expect(plan.counted.read).toBe(5);
    expect(plan.counted.readThroughOwn).toBe(3);
    const rosa = plan.passes.find((pass) => pass.storyKey === "story:2");
    expect(rosa?.volumeKey).toBe("volume:2");
    expect(rosa?.outcome).toBe("finished");
    expect(rosa?.endedOn).toBe("2018-04-02");
  });

  it("reads an interrupted pass as one that has not concluded, never as abandoned", () => {
    const sofia = plan.passes.find((pass) => pass.storyKey === "story:8");
    expect(sofia?.outcome).toBeNull();
    expect(sofia?.endedOn).toBeNull();
  });

  it("doubles the score onto the owner's scale and records the grain", () => {
    expect(plan.counted.rated).toBe(4);
    const rosa = plan.ratings.find((rating) => rating.storyKey === "story:2");
    expect(rosa?.score).toBe("10.0");
    expect(rosa?.scale).toBe("coarse");
  });

  it("puts no prose in the owner's mouth", () => {
    expect(plan.ratings.every((rating) => !("prose" in rating))).toBe(true);
  });

  it("reads two writers out of one cell, and names each person once", () => {
    expect(plan.counted.creditNames).toBe(8);
    expect(plan.credits).toHaveLength(8);
    expect(plan.people).toHaveLength(7);
    expect(plan.people).toContain("Richard Feynman");
    expect(plan.people).toContain("Robert Leighton");
    // Two rows by one author is one person and two Credits: the repeat guard is per Story.
    expect(plan.counted.creditRepeats).toBe(0);
    expect(plan.people.filter((name) => name === "Umberto Eco")).toHaveLength(1);
  });

  it("reads a script as a script", () => {
    expect(plan.counted.plays).toBe(1);
    expect(plan.stories.find((story) => story.title.startsWith("Sei personaggi"))?.typeId).toBe(
      "play"
    );
  });

  it("carries the object's own facts and none of the narrative's", () => {
    const rosa = plan.volumes.find((volume) => volume.title === "Il nome della rosa");
    expect(rosa).toMatchObject({
      publisher: "Bompiani",
      editionLine: "I grandi tascabili",
      bindingId: "paperback",
      language: "it",
      isbn: "9788845292611",
    });
  });

  it("takes the provenance from the half of the cell that testifies to the reading", () => {
    // `Foto + Goodreads`: a photograph proves an object is on a shelf and cannot say
    // anybody read it, so the reading half names the origin.
    expect(plan.passes.find((pass) => pass.storyKey === "story:2")?.provenanceId).toBe(
      "goodreads-history"
    );
    // `Foto + utente`: the owner said so themselves.
    expect(plan.passes.find((pass) => pass.storyKey === "story:6")?.provenanceId).toBe(
      "remembered"
    );
  });

  it("reports the columns it dropped rather than dropping them quietly", () => {
    expect([...plan.dropped.keys()]).toContain("Tag");
  });
});

describe("what stops it", () => {
  const HEADER =
    "Titolo,Autore/i,ISBN,Editore,Lingua,Categoria,Formato,Stato,Voto,Note,Posseduto,Rilegatura,Fonte\n";

  /** One tab, in a directory of its own, so the reader is exercised on a real file. */
  const write = (rows: string, header = HEADER): string => {
    const at = mkdtempSync(join(tmpdir(), "tsundoku-books-"));
    const file = join(at, "biblioteca.csv");
    writeFileSync(file, header + rows);
    return file;
  };

  const cleanup = (file: string) => rmSync(join(file, ".."), { recursive: true, force: true });

  it("refuses `Romanzo/Saggistica`, which is two Types with a slash between them", () => {
    const file = write(
      "Marina,Carlos Ruiz Zafón,,Edebe,,Romanzo/Saggistica,Cartaceo,Letto,5,,FALSE,,Goodreads\n"
    );
    try {
      expect(() => planBooks(file)).toThrow(Unreadable);
      expect(() => planBooks(file)).toThrow(/Romanzo\/Saggistica/);
    } finally {
      cleanup(file);
    }
  });

  it("refuses a row whose columns have slipped, because a vocabulary refuses the word", () => {
    // What a ragged row exports as: `Posseduto` holding the binding column's value.
    const file = write(
      "La divina comedia,Dante,,Tomo,,Romanzo,Cartaceo,Letto,3,,Cartaceo,,Goodreads\n"
    );
    try {
      expect(() => planBooks(file)).toThrow(/Posseduto/);
    } finally {
      cleanup(file);
    }
  });

  it("refuses two rows naming one title, because which granularity is the owner's call", () => {
    const file = write(
      "Marina,Zafón,,Edebe,,Romanzo,Cartaceo,Letto,5,,FALSE,,Goodreads\n" +
        "marina,Zafón,,Edebe,,Romanzo,Cartaceo,Letto,4,,FALSE,,Goodreads\n"
    );
    try {
      expect(() => planBooks(file)).toThrow(/already named/);
    } finally {
      cleanup(file);
    }
  });

  it("refuses a score off the sheet's own scale", () => {
    const file = write("Marina,Zafón,,Edebe,,Romanzo,Cartaceo,Letto,9,,FALSE,,Goodreads\n");
    try {
      expect(() => planBooks(file)).toThrow(/out of 5/);
    } finally {
      cleanup(file);
    }
  });

  it("refuses an ISBN that is neither ten characters nor thirteen", () => {
    const file = write("Marina,Zafón,12345,Edebe,,Romanzo,Cartaceo,Letto,5,,TRUE,Brossura,Foto\n");
    try {
      expect(() => planBooks(file)).toThrow(/ten characters nor thirteen/);
    } finally {
      cleanup(file);
    }
  });

  it("refuses a column it cannot do without", () => {
    const file = write("Marina,Zafón\n", "Titolo,Autore/i\n");
    try {
      expect(() => planBooks(file)).toThrow(/has no column for/);
    } finally {
      cleanup(file);
    }
  });
});
