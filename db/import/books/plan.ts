// The books half of the library, translated: what was read, and what stands on the shelf.
//
// One tab, read once, **into a database that already holds the comics half**. That is the
// whole difference from `db/import/`, and it is why this is a second importer rather than
// a tenth tab in the first one: that import refuses a database holding imported data, for
// the good reason that its ten tabs have no key to match a second run against. This one
// has one — a **title** — and it uses it in the only direction a title can be trusted in:
// to **refuse** a run whose titles are already there, so that running twice cannot leave
// two of everything.
//
// ## What a row of this tab is
//
// The old `Biblioteca` tab could say *I read this* and had no way at all to say *and it is
// on the shelf*, so `plan.ts` in the parent directory writes every books row as a Reading
// with no Volume. The reworked tab grew two columns — `Posseduto` and `Formato posseduto`
// — and they are the reason this file exists. A row now says up to three unrelated things:
//
//   - a **Story**, always: a title and a `Categoria` that is a Type;
//   - a **Reading**, when `Stato` says an act of reading happened;
//   - a **Volume** in the house, when `Posseduto` is true — plus the open **acquisition**
//     that is what being in the house means (ADR-0007), and the `volume_story` row that
//     says which narrative the object carries.
//
// Being read and being owned stay unrelated: twenty-eight rows are Goodreads history with
// no object, six are objects on the shelf nobody has opened, and neither is a special case
// of the other.
//
// ## What it refuses, and why that is the feature
//
// A value no vocabulary knows **stops the import with nothing written**, which is the
// parent import's rule and is inherited deliberately. Two of the refusals earned their
// keep on the owner's very first export:
//
//   - `Romanzo/Saggistica` in `Categoria` is not a Type. It is two Types with a slash
//     between them, and which one a row is cannot be read off the cell — only off the
//     book. Twenty-eight rows said it and the import stopped, twenty-eight times, until
//     the sheet said which.
//   - Four rows had **slipped a column**, the way a ragged row exports out of a
//     spreadsheet. Nothing here looks for that damage: `Posseduto` said `Cartaceo` and a
//     vocabulary refused a word, which is the same wall the eighteen other columns stand
//     behind.
//
// A fact about a book is fixed **in the sheet**, never here. This file translates words
// and counts what it translated; it does not repair data, because a repair encoded here is
// one export's accident carried for ever.

import { fold, readTab, type TabRow } from "../csv.ts";
import {
  bindingOf,
  dayOf,
  languageOf,
  mediumOf,
  ownedOf,
  provenanceOf,
  readingStateOf,
  typeOf,
  Untranslatable,
} from "../vocabulary.ts";
import { Counted } from "./expectations.ts";

/** A Story this import will create. */
export type PlannedStory = {
  readonly key: string;
  readonly title: string;
  readonly typeId: string;
};

/** A Volume in the house, and the Story the object carries. */
export type PlannedVolume = {
  readonly key: string;
  readonly title: string;
  readonly publisher: string;
  readonly editionLine: string | null;
  readonly bindingId: string;
  readonly language: string;
  readonly isbn: string | null;
  readonly storyKey: string;
};

export type PlannedReading = {
  readonly key: string;
  readonly storyKey: string;
  readonly medium: "paper" | "digital";
  readonly outcome: "finished" | "abandoned" | null;
  readonly startedOn: string | null;
  readonly endedOn: string | null;
  readonly provenanceId: string;
  /** The object the pass went through, where the owner has one. */
  readonly volumeKey: string | null;
};

export type PlannedRating = {
  readonly storyKey: string;
  readonly score: string;
  readonly provenanceId: string;
  readonly scale: "coarse";
};

export type PlannedCredit = {
  readonly storyKey: string;
  readonly name: string;
  readonly roleId: "writer";
};

/** Something the import read and did not write, said with the row it came from. */
export type Finding = {
  readonly line: number;
  readonly said: string;
};

export type Plan = {
  readonly tab: string;
  readonly stories: readonly PlannedStory[];
  readonly volumes: readonly PlannedVolume[];
  readonly readings: readonly PlannedReading[];
  readonly ratings: readonly PlannedRating[];
  readonly credits: readonly PlannedCredit[];
  /**
   * Every person the tab credits, once each, spelled as the first row that named them
   * spelled it.
   *
   * De-duplicated on `lower(name)` and on nothing else, because that is the unique index
   * Postgres keeps (`person_is_named_once`) and the match `creditStory` makes. A fold that
   * also dropped punctuation would quietly merge two spellings the database would have
   * kept apart, and then the count that checks this import would be measuring the fold.
   */
  readonly people: readonly string[];
  readonly counted: Counted;
  /** Rows read and not written, each one a sentence the owner can act on. */
  readonly findings: readonly Finding[];
  /** Columns the tab has that the model has nowhere to put. */
  readonly dropped: ReadonlyMap<string, number>;
};

/** A row the import cannot read at all. It stops the run. */
export class Unreadable extends Error {
  readonly line: number;

  constructor(line: number, said: string) {
    super(`Biblioteca row ${line}: ${said}`);
    this.name = "Unreadable";
    this.line = line;
  }
}

/** The columns the tab has to have, each with the spellings the export has used. */
const REQUIRED = [["Titolo", "Libro"], ["Categoria", "Tipo"], ["Formato"], ["Posseduto"]] as const;

/**
 * Columns the tab carries and the model has no home for.
 *
 * Reported with a count rather than dropped in silence, and **not** given a home: a tag
 * table, a "technical currency" flag and a year of edition are four decisions, and an
 * import is not where a decision gets taken. `Prezzo pagato` is the one that would have a
 * home — an acquisition's price — and every cell of it in the owner's export is empty.
 */
const HAS_NOWHERE_TO_GO = ["Tag", "Attualità tecnica", "Anno edizione", "Prezzo pagato"] as const;

/** Read one row's names out of an `Autore/i` cell. */
function people(said: string | null): readonly string[] {
  if (said === null) return [];
  return said
    .split(/\s*[;|&]\s*|\s+e\s+/)
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

/** Read the tab and say what the library should hold because of it. */
export function planBooks(file: string): Plan {
  const tab = readTab(file, "Biblioteca", REQUIRED);
  const counted = new Counted();
  const findings: Finding[] = [];
  const stories: PlannedStory[] = [];
  const volumes: PlannedVolume[] = [];
  const readings: PlannedReading[] = [];
  const ratings: PlannedRating[] = [];
  const credits: PlannedCredit[] = [];
  const peopleSeen = new Map<string, string>();
  const titles = new Map<string, number>();

  for (const row of tab.rows) {
    planRow(row, {
      counted,
      findings,
      stories,
      volumes,
      readings,
      ratings,
      credits,
      peopleSeen,
      titles,
    });
  }

  const dropped = new Map<string, number>();
  for (const column of HAS_NOWHERE_TO_GO) {
    if (!tab.has(column)) continue;
    const held = tab.rows.filter((row) => row.value(column) !== null).length;
    if (held > 0) dropped.set(column, held);
  }

  return {
    tab: tab.name,
    stories,
    volumes,
    readings,
    ratings,
    credits,
    people: [...peopleSeen.values()],
    counted,
    findings,
    dropped,
  };
}

/**
 * A note on the row numbers in this file's findings, because the owner reads them.
 *
 * `parseCsv` drops a row of nothing but empty cells — that is what a sheet's unused rows
 * and the gap the owner left between two batches export as — and `readTab` numbers what
 * survives. So a line number here counts **rows that said something**, and after a gap it
 * is one lower than the row number the spreadsheet shows. Every finding names the title as
 * well for exactly that reason: a title is unambiguous where a line number is off by
 * however many gaps precede it.
 */

type Building = {
  counted: Counted;
  findings: Finding[];
  stories: PlannedStory[];
  volumes: PlannedVolume[];
  readings: PlannedReading[];
  ratings: PlannedRating[];
  credits: PlannedCredit[];
  peopleSeen: Map<string, string>;
  titles: Map<string, number>;
};

function planRow(row: TabRow, into: Building): void {
  const title = row.value("Titolo", "Libro");
  if (title === null) throw new Unreadable(row.line, "no title, and a Story is a title.");

  const already = into.titles.get(fold(title, " "));
  if (already !== undefined) {
    throw new Unreadable(
      row.line,
      `"${title}" is the title row ${already} already named. Two rows saying one title is ` +
        "two objects or one mistake, and this import cannot tell which — the granularity of " +
        "a Story is the owner's call, case by case (CONTEXT.md), so it is taken by hand."
    );
  }
  into.titles.set(fold(title, " "), row.line);
  into.counted.rows += 1;

  const typeId = translated(row.line, () =>
    typeOf(must(row, row.value("Categoria", "Tipo"), "Categoria"))
  );
  if (typeId === "play") into.counted.plays += 1;
  const storyKey = `story:${row.line}`;
  into.stories.push({ key: storyKey, title, typeId });

  // ── the object, when the house holds it ──────────────────────────────────
  const owned = translated(row.line, () => ownedOf(row.value("Posseduto")));
  let volumeKey: string | null = null;
  if (owned) {
    into.counted.owned += 1;
    volumeKey = planVolume(row, title, storyKey, into);
  }

  // ── the act of reading, when there was one ───────────────────────────────
  const medium = translated(row.line, () => mediumOf(must(row, row.value("Formato"), "Formato")));
  const provenanceId = translated(row.line, () => provenanceOf(row.value("Fonte", "Provenienza")));

  const saidState = row.value("Stato", "Stato lettura");
  // **An empty `Stato` is not a reading**, which is where this parts company with the
  // parent import's books tab (there an absent column means the row was read). Six rows of
  // the owner's export leave it empty and every one of them is a manual on a shelf: five
  // carry no score either. Inventing a finished pass for them would put six acts of
  // reading in the library that never happened, and a Story with no Reading is an ordinary
  // Story — the shape the model already has for a book nobody has opened.
  const state =
    saidState === null
      ? { read: false, outcome: null }
      : translated(row.line, () => readingStateOf(saidState));

  if (state.read) {
    into.counted.read += 1;
    // A pass on paper through an object the owner holds went **through that object**, which
    // is the parent import's reading of the same shape on the comics sheet. A digital pass
    // goes through none: Postgres refuses it, and an ebook is deliberately not an object.
    const through = medium === "paper" ? volumeKey : null;
    if (through !== null) into.counted.readThroughOwn += 1;
    const day = dayOf(row.value("Data lettura", "Data fine", "Letto il", "Data"));
    into.readings.push({
      key: `reading:${row.line}`,
      storyKey,
      medium,
      outcome: state.outcome,
      startedOn: dayOf(row.value("Data inizio", "Iniziato il", "Iniziata il")),
      // A day is when a fact happened, and `Data lettura` is the day the pass ended on the
      // six rows that carry one. An unconcluded pass may not carry an end at all — Postgres
      // says so — so the column is read onto the end only where the row says it concluded.
      endedOn: state.outcome === null ? null : day,
      provenanceId,
      volumeKey: through,
    });
  } else {
    into.findings.push({
      line: row.line,
      said: `"${title}" is not read yet, so it is a Story with no Reading.`,
    });
  }

  // ── the judgement ────────────────────────────────────────────────────────
  const saidScore = row.value("Voto", "Valutazione");
  if (saidScore !== null) {
    const out5 = Number(saidScore.replace(",", "."));
    if (!Number.isFinite(out5) || out5 < 1 || out5 > 5) {
      throw new Unreadable(row.line, `Voto says "${saidScore}", and this sheet scores out of 5.`);
    }
    into.counted.rated += 1;
    // ADR-0008 in one line: the 1-5 doubles onto the owner's scale, the doubling is the
    // score's **grain** and is recorded as such, and the Provenance goes on saying only
    // where the judgement came from.
    into.ratings.push({ storyKey, score: (out5 * 2).toFixed(1), provenanceId, scale: "coarse" });
  }

  // **No prose, from any row.** `Note` on this tab holds provenance chatter — "storico
  // Goodreads; possesso attuale non confermato", "lettura iniziata e poi fermata" — and
  // not one cell of it is a judgement of a book. Writing those into a Rating's prose would
  // put words in the owner's mouth on twenty-eight titles, which is worse than losing a
  // column that says nothing this application asks about.

  // ── who wrote it ─────────────────────────────────────────────────────────
  for (const name of people(row.value("Autore/i", "Autore", "Autori", "Scrittore"))) {
    into.counted.creditNames += 1;
    const key = fold(name, " ");
    if (
      into.credits.some((credit) => credit.storyKey === storyKey && fold(credit.name, " ") === key)
    ) {
      into.counted.creditRepeats += 1;
      continue;
    }
    if (!into.peopleSeen.has(name.toLowerCase())) into.peopleSeen.set(name.toLowerCase(), name);
    into.credits.push({ storyKey, name, roleId: "writer" });
  }
}

/**
 * The Volume a `Posseduto` row stands for, or nothing when the sheet cannot describe one.
 *
 * A Volume needs a **publisher** and a **binding**, and Postgres says so rather than this
 * file: `volume_publisher_is_not_blank` and a foreign key into `binding`. The owner's first
 * export had the publisher on one owned row of twenty-six and a binding on none — the
 * `Formato posseduto` column says `Cartaceo`, which is a **reading medium** and the very
 * confusion `CONTEXT.md` bans the word `format` for.
 *
 * So a row the sheet cannot describe an object from is **reported and gets no Volume**,
 * while its Story and its Reading land as they would anyway. It is the parent import's own
 * answer to the same shape of gap — a wishlist row naming a Series position is reported
 * with its row number and the position is not written — and it is the honest one: a
 * publisher this import guessed at is a permanent fact, silent, and wrong in a way the
 * owner would never notice.
 */
function planVolume(row: TabRow, title: string, storyKey: string, into: Building): string | null {
  const publisher = row.value("Editore");
  const saidBinding = row.value("Rilegatura", "Legatura");
  if (publisher === null || saidBinding === null) {
    into.counted.undescribable += 1;
    const missing = [
      publisher === null ? "an Editore" : null,
      saidBinding === null ? "a Rilegatura" : null,
    ]
      .filter((part) => part !== null)
      .join(" and ");
    into.findings.push({
      line: row.line,
      said:
        `"${title}" is in the house and the sheet does not say ${missing}, so no Volume is ` +
        "written for it. The Story and the reading history are unaffected; fill the two " +
        "columns in and run this again.",
    });
    return null;
  }

  const bindingId = translated(row.line, () => bindingOf(saidBinding));
  const language = translated(row.line, () => languageOf(row.value("Lingua")));
  const isbn = row.value("ISBN");
  if (isbn !== null && !/^(?:[0-9]{9}[0-9Xx]|[0-9]{13})$/.test(isbn.replace(/[\s-]/g, ""))) {
    throw new Unreadable(
      row.line,
      `ISBN says "${isbn}", which is neither ten characters nor thirteen.`
    );
  }

  into.counted.describable += 1;
  const key = `volume:${row.line}`;
  into.volumes.push({
    key,
    // The object's title is the title on the row. A Volume's title and the Story's are the
    // same string here and are two facts all the same: one names an object, one a narrative.
    title,
    publisher,
    editionLine: row.value("Edizione", "Collana"),
    bindingId,
    language,
    isbn: isbn === null ? null : isbn.replace(/[\s-]/g, ""),
    storyKey,
  });
  return key;
}

/** A cell the row has to have for the line to mean anything. */
function must(row: TabRow, value: string | null, column: string): string {
  if (value === null)
    throw new Unreadable(row.line, `no ${column}, which this import cannot do without.`);
  return value;
}

/** Run a translation, and say which row an untranslatable word was on. */
function translated<T>(line: number, translate: () => T): T {
  try {
    return translate();
  } catch (cause) {
    if (cause instanceof Untranslatable) throw new Unreadable(line, cause.message);
    throw cause;
  }
}
