// The sheets' words, translated into the model's.
//
// This file is where the import earns its name. The sheets are an **address book, not a
// description**: they point at objects and stories the owner really has, and their column
// headings are eighteen months of typing rather than a model. So every value crosses into
// the library through a table here, and a value no table knows **stops the import** rather
// than entering as itself — a silent passthrough is how a spreadsheet's vocabulary ends up
// being the schema's.
//
// Three confusions in particular do not survive, and each has its own function below.
//
//   1. `Formato` means a **Binding** in `Collezione Fumetti e Manga` (Tankobon, Omnibus,
//      Must Have) and a **reading medium** in `Biblioteca e Letture` (Cartaceo, Ebook).
//      One word, two questions, and it served neither — which is why `CONTEXT.md` bans
//      the word `format` outright. There are two tables here and they never meet:
//      `bindingOf` for the comics sheet, `mediumOf` for the books sheet.
//   2. `Serie / Universo` carries a **Series**, a **universe** and a reading **Path** in
//      one cell. `splitSeriesUniversePath` takes it apart. The Series becomes a Series
//      and the Path becomes a Path; the universe becomes a **finding**, because the model
//      has no universe and a column is not a reason to give it one.
//   3. `Acquistato` sits among the wishlist's states, where it is not a state of wanting
//      at all — it is a **Wish that ended**, plus a Volume that came home. `wishStateOf`
//      says so, and the plan writes the two facts the row actually holds.

import { fold } from "./csv.ts";

/** A value in the sheet the model has no word for. The import stops on one. */
export class Untranslatable extends Error {
  // Declared and assigned rather than taken as constructor parameter properties: `db/` is
  // run by plain `node`, which strips types and cannot erase a parameter property without
  // deleting the assignment with it.
  readonly column: string;
  readonly said: string;

  constructor(column: string, said: string, known: readonly string[]) {
    super(
      `${column}: the sheet says "${said}", which the model has no word for. ` +
        `It knows: ${known.join(", ")}.`
    );
    this.name = "Untranslatable";
    this.column = column;
    this.said = said;
  }
}

/** Fold a cell to what two spellings of one value have in common — see `fold`. */
function folded(said: string): string {
  return fold(said, " ");
}

function translate<T>(column: string, said: string, table: Record<string, T>): T {
  const found = table[folded(said)];
  if (found === undefined) throw new Untranslatable(column, said, Object.keys(table));
  return found;
}

// ── Type ────────────────────────────────────────────────────────────────────
// Rows in the `type` table, never an enum in code (ADR-0006), so these are the five ids
// the seed migration inserted and this table is only the Italian the owner typed.
const TYPES: Record<string, string> = {
  manga: "manga",
  fumetto: "comic",
  fumetti: "comic",
  comic: "comic",
  comics: "comic",
  "graphic novel": "graphic-novel",
  romanzo: "novel",
  narrativa: "novel",
  novel: "novel",
  saggio: "non-fiction",
  saggistica: "non-fiction",
  "non fiction": "non-fiction",
  manualistica: "non-fiction",
};

/** `Tipo` as a Type id. */
export function typeOf(said: string): string {
  return translate("Tipo", said, TYPES);
}

// ── `Formato`, first meaning: the Binding ───────────────────────────────────
// How the object is bound, in the comics sheet. Ids from the `binding` table.
const BINDINGS: Record<string, string> = {
  tankobon: "tankobon",
  tankoubon: "tankobon",
  omnibus: "omnibus",
  deluxe: "deluxe",
  "must have": "must-have",
  cartonato: "hardcover",
  rilegato: "hardcover",
  hardcover: "hardcover",
  brossura: "paperback",
  brossurato: "paperback",
  paperback: "paperback",
  tascabile: "paperback",
  spillato: "stapled",
  // The comics sheet says the binding and something else in the same cell — a dust jacket,
  // a doubled volume, a trim size. Only the binding is read. The rest is collector's
  // metadata about the object and answers nothing this application is for, so it is
  // dropped rather than carried into the model as a note nobody queries.
  //
  // One of them does have a home here, and it is not a note: `volume doppio` says the
  // Volume carries two volumes' worth of Stories, which is `volume_story`
  // (migration 0006_01). If that is ever wanted it belongs there, stated per Story,
  // rather than as prose on the object.
  "brossurato con sovraccoperta": "paperback",
  "brossurato volume doppio": "paperback",
  "15x21 brossurato": "paperback",
  "cartonato 17x26": "hardcover",
  // A trim size and no binding at all. Read as a paperback because that is what J-Pop's
  // edition at this size is; it is an inference about one row, and it is here in the open
  // rather than in the plan so that correcting it is one word.
  "15x21": "paperback",
};

/**
 * `Formato`, read as the comics sheet means it: a Binding.
 *
 * Never as a medium. A Volume has no medium at all — digital ownership is deliberately
 * not modelled — so the two readings of this column are not two spellings of one
 * question, and nothing here falls back to the other table.
 */
export function bindingOf(said: string): string {
  return translate("Formato (Collezione)", said, BINDINGS);
}

// ── `Formato`, second meaning: the reading medium ───────────────────────────
// How the owner read it, in the books sheet. Paper or digital, and that is the whole
// vocabulary — a Reading's medium is the model's own shape rather than a data row.
const MEDIA: Record<string, "paper" | "digital"> = {
  cartaceo: "paper",
  carta: "paper",
  cartonato: "paper",
  brossura: "paper",
  paper: "paper",
  ebook: "digital",
  "e book": "digital",
  digitale: "digital",
  kindle: "digital",
  digital: "digital",
};

/** `Formato`, read as the books sheet means it: the medium one act of reading used. */
export function mediumOf(said: string): "paper" | "digital" {
  return translate("Formato (Biblioteca)", said, MEDIA);
}

/**
 * The Binding a books-sheet wishlist row asks for, or `null` when the row wants a file.
 *
 * A wish names a **Volume**, and a Volume is an object: a wished ebook has nothing to
 * name. The row is not importable and the plan reports it rather than inventing a
 * paperback the owner never asked for.
 */
export function wishedBindingOf(said: string): string | null {
  if (mediumOf(said) === "digital") return null;
  return translate("Formato (Wishlist Biblioteca)", said, BINDINGS);
}

// ── `Stato lettura` ────────────────────────────────────────────────────────
// A Story's state is derived from its Readings and never stored (user story 13), so this
// column does not become a field: it becomes a Reading, or nothing at all.
export type ReadingState = {
  /** Whether the row says an act of reading happened. */
  readonly read: boolean;
  /** How it ended, where it has. `null` is a Reading still open. */
  readonly outcome: "finished" | "abandoned" | null;
};

const READING_STATES: Record<string, ReadingState> = {
  letto: { read: true, outcome: "finished" },
  letta: { read: true, outcome: "finished" },
  completato: { read: true, outcome: "finished" },
  finito: { read: true, outcome: "finished" },
  "in lettura": { read: true, outcome: null },
  iniziato: { read: true, outcome: null },
  abbandonato: { read: true, outcome: "abandoned" },
  droppato: { read: true, outcome: "abandoned" },
  "da leggere": { read: false, outcome: null },
  "non letto": { read: false, outcome: null },
  arretrato: { read: false, outcome: null },
};

/** `Stato lettura` as the act of reading it stands for, if there was one. */
export function readingStateOf(said: string): ReadingState {
  return translate("Stato lettura", said, READING_STATES);
}

// ── `Stato` on a wishlist row ──────────────────────────────────────────────
export type WishState = {
  /** Whether the intention is still open. */
  readonly open: boolean;
  /** Whether the row also says the object came home. */
  readonly acquired: boolean;
};

/**
 * The wishlist's `Stato` column, and the one value in it that is not a state of wanting.
 *
 * `Acquistato` is **a Wish that ended**: the intention was acted on, the object is in the
 * house, and both of those are facts the model already has words for — a closed Wish and
 * an open acquisition. It does not survive as a wish state, because a Wish has no state
 * column to survive in: it is open until a deliberate act closes it (#10), and reading
 * `Acquistato` *is* that act.
 */
const WISH_STATES: Record<string, WishState> = {
  "da comprare": { open: true, acquired: false },
  // Still weighing it up: an intention, and not yet an act.
  "da valutare": { open: true, acquired: false },
  // Ordered and not yet here. Deliberately an **open** wish rather than a closed one with
  // an acquisition: the object is not in the house, and saying it is would make the
  // library claim a volume the owner cannot pick up. The wish closes when the parcel
  // arrives, which is the deliberate act #10 asks for.
  ordinato: { open: true, acquired: false },
  desiderato: { open: true, acquired: false },
  aperto: { open: true, acquired: false },
  "in attesa": { open: true, acquired: false },
  "prezzo trovato": { open: true, acquired: false },
  monitorato: { open: true, acquired: false },
  acquistato: { open: false, acquired: true },
  comprato: { open: false, acquired: true },
  abbandonato: { open: false, acquired: false },
  rinunciato: { open: false, acquired: false },
};

export function wishStateOf(said: string): WishState {
  return translate("Stato (Wishlist)", said, WISH_STATES);
}

// ── Provenance ─────────────────────────────────────────────────────────────
// Origin only, and never how coarse a score is (ADR-0008). Ids from the `provenance`
// table, which no longer holds `converted-from-a-coarser-scale`.
const PROVENANCES: Record<string, string> = {
  goodreads: "goodreads-history",
  "goodreads history": "goodreads-history",
  "storico goodreads": "goodreads-history",
  "censimento fotografico": "photo-census",
  foto: "photo-census",
  "photo census": "photo-census",
  scaffale: "typed-from-the-shelf",
  "dallo scaffale": "typed-from-the-shelf",
  ricordo: "remembered",
  "a memoria": "remembered",
};

/**
 * `Provenienza` as a Provenance id, defaulting to the sheet itself.
 *
 * A row with nothing in the column was typed off the shelf, which is what
 * `typed-from-the-shelf` means and is the honest origin of every cell in these two
 * sheets that does not name another one.
 */
export function provenanceOf(said: string | null): string {
  if (said === null) return "typed-from-the-shelf";
  return translate("Provenienza", said, PROVENANCES);
}

// ── `Serie / Universo` ─────────────────────────────────────────────────────

/**
 * The Series and the Paths the two sheets **declare**, which is how a part of a
 * `Serie / Universo` cell gets recognised instead of guessed at.
 */
export type Declared = {
  readonly series: ReadonlySet<string>;
  readonly paths: ReadonlySet<string>;
};

/** What one cell of `Serie / Universo` was actually holding. */
export type SeriesUniversePath = {
  /** The publisher's line, which is what the model calls a Series. */
  readonly series: string | null;
  /**
   * The shared world the story sits in: `Universo DC`, `Marvel`, `Shonen Jump`.
   *
   * **The model has no universe.** It is carried out of the cell so that it stops
   * pretending to be a Series, and then reported — inventing a table for it would be the
   * sheet shaping the schema, which is the one thing this import may not do.
   */
  readonly universe: string | null;
  /** The owner's own ordered route, which the model calls a Path. */
  readonly path: string | null;
};

/** How the owner separates the parts inside one cell. */
const SEPARATORS = /\s*[/|·•]\s*|\s+[–—]\s+/;

/**
 * Take one `Serie / Universo` cell apart into the three things it holds.
 *
 * The cell is split on the separators the owner uses, and each part is then **recognised
 * rather than guessed**: a part that names a Series declared in `Serie e Percorsi` is the
 * Series, a part that names a Path declared there or in `Percorsi` is the Path. What is
 * left over is the universe — a label with nowhere to go, which is exactly why it has to
 * be separated out before either of the other two is trusted.
 *
 * When nothing matched a declared Series, the **first** unrecognised part is taken as one:
 * the column's first token is the line the volume belongs to in every row of the owner's
 * sheet, and a Series the owner never declared is still a Series.
 */
export function splitSeriesUniversePath(cell: string, declared: Declared): SeriesUniversePath {
  const parts = cell
    .split(SEPARATORS)
    .map((part) => part.trim())
    .filter((part) => part !== "");

  let series: string | null = null;
  let path: string | null = null;
  const rest: string[] = [];

  for (const part of parts) {
    const known = folded(part);
    if (series === null && declared.series.has(known)) {
      series = part;
      continue;
    }
    if (path === null && declared.paths.has(known)) {
      path = part;
      continue;
    }
    rest.push(part);
  }

  if (series === null && rest.length > 0) series = rest.shift() ?? null;

  return { series, universe: rest.length === 0 ? null : rest.join(" / "), path };
}

/** The same fold the vocabularies use, for a caller building a set of declared names. */
export function nameKey(name: string): string {
  return folded(name);
}

// ── Numbers, prices and days ───────────────────────────────────────────────

/** A price as the sheet writes it — `12,90 €`, `€ 12.90` — as `12.90`, or null. */
export function amountOf(said: string | null): string | null {
  if (said === null) return null;
  const digits = said.replace(/[^0-9,.]/g, "").replace(",", ".");
  if (digits === "" || !/^[0-9]+(\.[0-9]{1,2})?$/.test(digits)) return null;
  return digits;
}

/** A whole number, or null. */
export function integerOf(said: string | null): number | null {
  if (said === null) return null;
  const digits = said.replace(/[^0-9-]/g, "");
  if (!/^-?[0-9]+$/.test(digits)) return null;
  return Number(digits);
}

/**
 * A day as `YYYY-MM-DD`, from any of the three ways the two sheets write one.
 *
 * `null` where the cell holds something that is not a day — a year on its own, or the
 * word `sconosciuta`. A day is *when* a fact happened and never the fact itself
 * (ADR-0007), so a cell nobody can read costs the row nothing.
 */
export function dayOf(said: string | null): string | null {
  if (said === null) return null;
  const iso = said.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const written = said.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (written) {
    const day = written[1].padStart(2, "0");
    const month = written[2].padStart(2, "0");
    return `${written[3]}-${month}-${day}`;
  }
  return null;
}

/**
 * A language code, from what the sheet says: `Italiano`, `it`, `Giapponese`.
 *
 * Unknown values stop the import like any other untranslatable cell — a wrong language on
 * a hundred volumes is not something to discover from a screen later.
 */
const LANGUAGES: Record<string, string> = {
  italiano: "it",
  ita: "it",
  it: "it",
  inglese: "en",
  eng: "en",
  en: "en",
  giapponese: "ja",
  jap: "ja",
  ja: "ja",
  francese: "fr",
  fr: "fr",
  spagnolo: "es",
  es: "es",
  tedesco: "de",
  de: "de",
};

export function languageOf(said: string | null): string {
  // Italian is what an empty cell means in a library kept in Italy, and the owner's two
  // sheets leave it empty on every Italian row.
  if (said === null) return "it";
  return translate("Lingua", said, LANGUAGES);
}
