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
//      Must Have) and a **Medium** in `Biblioteca e Letture` (Cartaceo, Ebook).
//      One word, two questions, and it served neither — which is why `CONTEXT.md` bans
//      the word `format` outright. There are two tables here and they never meet:
//      `bindingOf` for the comics sheet, `mediumOf` for the books sheet.
//   2. `Serie / Universo` carries a **Series**, a **universe** and a **Path** in
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
  // The books sheet's own word for a book bought to be consulted: a manual, a textbook,
  // an engineering-management book. It is the `Categoria` cell and not a tag, so it is a
  // Type, and non-fiction is the Type it is.
  tecnico: "non-fiction",
  tecnica: "non-fiction",
  // A script, which is neither a novel nor non-fiction (migration 0013). One row of the
  // owner's sheet says it and that is reason enough: `Teatro` sits in the column every
  // other row uses for `Romanzo`.
  teatro: "play",
  play: "play",
  copione: "play",
};

/**
 * `Tipo` — `Categoria` in the reworked books sheet — as a Type id.
 *
 * **`Romanzo/Saggistica` is deliberately not in the table above**, and it is the one value
 * the owner's export has that this refuses. It is not a spelling of a Type: it is two
 * Types with a slash between them, left over from a column that once meant *is this
 * fiction or is it not, roughly*. Twenty-eight rows say it, and which of the two each row
 * is cannot be read off the cell — only off the book.
 *
 * So it stops the import, by the same rule every other unknown value stops it: a
 * spreadsheet's vocabulary does not get to become the schema's, and a coin flip over
 * twenty-eight rows would be exactly that. The fix is in the sheet, one cell at a time,
 * which is where a fact about a book belongs.
 */
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
  "15 21 brossurato": "paperback",
  "cartonato 17 26": "hardcover",
  // The keys are written **as `folded` leaves them**, which is why these read oddly: the
  // sheet says `15×21` with a multiplication sign, and folding replaces anything that is
  // not a letter or a digit with a space. A key spelled `15x21` with an ASCII x is a key
  // this table will never match, and the import says so at the row rather than silently.
  //
  // A trim size and no binding at all. Read as a paperback because that is what J-Pop's
  // edition at this size is; it is an inference about one row, and it is here in the open
  // rather than in the plan so that correcting it is one word.
  "15 21": "paperback",
};

/**
 * `Formato`, read as the comics sheet means it: a Binding.
 *
 * Never as a medium. A Volume has no medium at all — digital ownership is deliberately
 * not modelled — so the two passes of this column are not two spellings of one
 * question, and nothing here falls back to the other table.
 */
export function bindingOf(said: string): string {
  return translate("Formato (Collezione)", said, BINDINGS);
}

// ── `Formato`, second meaning: the Medium ──────────────────────────────────
// What the pass went by, in the books sheet. Paper or digital, which is the whole of what
// these two sheets can say: the medium is a vocabulary the library grows a console at a time
// (ADR-0022), and a spreadsheet of printed things reaches neither of them.
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

/** `Formato`, read as the books sheet means it: the medium one pass went by. */
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
// A Story's state is derived from its Passes and never stored (user story 13), so this
// column does not become a field: it becomes a Pass, or nothing at all.
export type PassState = {
  /** Whether the row says a pass happened. */
  readonly read: boolean;
  /** How it ended, where it has. `null` is a Pass still open. */
  readonly outcome: "finished" | "abandoned" | null;
};

const PASS_STATES: Record<string, PassState> = {
  letto: { read: true, outcome: "finished" },
  letta: { read: true, outcome: "finished" },
  completato: { read: true, outcome: "finished" },
  finito: { read: true, outcome: "finished" },
  "in lettura": { read: true, outcome: null },
  iniziato: { read: true, outcome: null },
  abbandonato: { read: true, outcome: "abandoned" },
  droppato: { read: true, outcome: "abandoned" },
  // **Not abandoned.** The owner's own note on both rows that say this reads "lettura
  // iniziata e poi fermata; non necessariamente abbandonata", and the model has a word for
  // a pass that has not concluded: an outcome of `null`. Reading it as `abandoned` would
  // put a decision in the library that the owner wrote down as not taken.
  interrotto: { read: true, outcome: null },
  interrotta: { read: true, outcome: null },
  fermato: { read: true, outcome: null },
  sospeso: { read: true, outcome: null },
  "da leggere": { read: false, outcome: null },
  "non letto": { read: false, outcome: null },
  arretrato: { read: false, outcome: null },
};

/**
 * The judgement inside a notes cell that also carries other things.
 *
 * The comics sheet has one `Note` column and the owner put two kinds of thing in it: what
 * they thought of the book, and the logistics of getting it — "Codice articolo Panini:
 * M1DCMH0", "Ordine Ebond annullato per copia danneggiata", an ISBN, a cover price.
 *
 * They separated the two themselves, consistently, by writing `Mini-review:` in front of
 * the judgement. So this reads their marker rather than guessing at sentences: what follows
 * it is the Rating's prose, and the logistics stay out of a field that is meant to hold an
 * opinion.
 *
 * With no marker the whole cell is the judgement, which is the honest reading of a note on
 * a book somebody scored: it is all they wrote about it.
 */
export function judgementIn(said: string | null): string | null {
  if (said === null) return null;
  const marked = /mini-?review\s*:\s*(.+)/is.exec(said);
  const prose = (marked ? marked[1] : said).trim();
  return prose === "" ? null : prose;
}

/** `Stato lettura` as the pass it stands for, if there was one. */
export function passStateOf(said: string): PassState {
  return translate("Stato lettura", said, PASS_STATES);
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

// ── `Posseduto` ────────────────────────────────────────────────────────────
// The column the reworked books sheet grew, and the reason there is a second import at
// all: the old sheet could say *I read this* and had no way at all to say *and it is on
// the shelf*. It is a spreadsheet checkbox, so its two values are Google's own.
const OWNED: Record<string, boolean> = {
  true: true,
  vero: true,
  si: true,
  x: true,
  false: false,
  falso: false,
  no: false,
};

/**
 * `Posseduto` as the one fact it holds: whether the object is in the house.
 *
 * A value neither table knows stops the import, and here that refusal earns its keep
 * twice over. A cell of this column holding `Cartaceo` or a sentence about a reading is
 * not a checkbox somebody mistyped — it is a **row whose columns have slipped**, which is
 * what a CSV exported from a sheet with a ragged row looks like from in here. Four rows of
 * the owner's first export were exactly that, and every one of them was caught by a
 * vocabulary refusing a word rather than by anything looking for the damage.
 */
export function ownedOf(said: string | null): boolean {
  if (said === null) return false;
  return translate("Posseduto", said, OWNED);
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
  // ── The reworked books sheet says two origins in one cell ──────────────────
  // A Provenance is one origin, and these cells name two. What the column has to answer
  // is *where the fact came from*, and the fact on one of these rows is a **Reading** —
  // so the photograph is not the origin of it. A photograph proves an object is on a
  // shelf; it cannot testify that anybody read the thing. Whatever else the cell lists,
  // the reading half is what names the Provenance.
  "foto goodreads": "goodreads-history",
  // The photograph is the origin, and the ISBN and the publisher check are how much of the
  // *detail* was confirmed. That is what `photo-census` already says about itself: the
  // object is certain and the detail is not.
  "foto isbn verifica editore": "photo-census",
  // The owner said so, in as many words, while the sheet was being put together. That is
  // `remembered` and it is the most reliable thing in here.
  "foto utente": "remembered",
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
  if (/^-?[0-9]+$/.test(digits)) return Number(digits);
  return romanOf(said);
}

/**
 * A volume number written the way its publisher wrote it.
 *
 * Death Note Black Edition is numbered I to VI on the spine, and the owner's sheet says
 * so. Reading it as "no number" would leave those volumes catalogued outside their Series
 * — which is not what the sheet says, only what a parser that knows one notation would
 * hear.
 *
 * Only whole Roman numerals, and only where a number is what was asked for: `integerOf` is
 * used in three places and all three ask which volume this is or how many are out. It is
 * deliberately not a general string-to-number, because `I` is a number here and a pronoun
 * almost anywhere else.
 */
const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

function romanOf(said: string): number | null {
  const letters = said.trim().toLowerCase();
  if (!/^[ivxlcdm]+$/.test(letters)) return null;

  let total = 0;
  for (let at = 0; at < letters.length; at += 1) {
    const here = ROMAN[letters[at]] as number;
    const next = at + 1 < letters.length ? (ROMAN[letters[at + 1]] as number) : 0;
    // IV is four and VI is six: a smaller numeral before a larger one subtracts.
    total += here < next ? -here : here;
  }
  return total;
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
  // The fourth way, and the one the reworked books sheet writes: `2020/03/22`, which is
  // what Google Sheets exports a date column as when the locale puts the year first. It is
  // unambiguous — a four-digit year cannot be a day — and it was worth finding, because
  // reading it as "not a day" lost every reading date the owner had recorded and said
  // nothing about it.
  const yearFirst = said.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (yearFirst) {
    return `${yearFirst[1]}-${yearFirst[2].padStart(2, "0")}-${yearFirst[3].padStart(2, "0")}`;
  }
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
