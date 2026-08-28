// What the two sheets say, in the model's own words.
//
// Pure: tabs in, a plan out, plus everything the run has to tell the owner. Nothing here
// touches Postgres, which is what lets the whole translation be looked at — and argued
// with — before a single row is written.
//
// The plan is **keyed rather than identified**. A Volume's id is minted by the database,
// so a row that needs to point at one carries the plan's own key (`volume:Collezione:14`)
// and `write.ts` swaps keys for ids as it goes. Keys carry the tab and the line they came
// from on purpose: every number in the report can be walked back to a cell.
//
// ## What stops the import, and what is only reported
//
// **Blocking** is anything that would make the library say something false, or drop
// something the sheets do say: a cell in a vocabulary the model has no word for, a score
// outside the scale its sheet uses, two rows disagreeing about one Story's score, an
// object with no publisher. The import writes nothing and the owner fixes the sheet or
// the mapping. That is the shape ADR-0009 gave a one-shot import: a finding is not a fix.
//
// **Noted** is everything the sheets hold that the model deliberately has no room for. It
// is printed, counted, and the row still enters as far as it can. Three of these are the
// interesting output of this whole slice:
//
//   - the **universes** carried out of `Serie / Universo`. There is no universe in the
//     model and this import may not add one.
//   - the wishlist rows that name a **Series position**. Placing a Volume in a Series
//     asks that the house hold it (ADR-0007), and a wanted object does not; the position
//     is reported rather than written, because loosening that rule is a decision nobody
//     has taken.
//   - the books-wishlist rows that want a **file**. A Wish names a Volume and digital
//     ownership is not modelled, so there is nothing for the Wish to name.

import type { Tab, TabRow } from "./csv.ts";
import type { Sheets } from "./sheets.ts";
import {
  amountOf,
  bindingOf,
  dayOf,
  integerOf,
  languageOf,
  mediumOf,
  nameKey,
  provenanceOf,
  readingStateOf,
  splitSeriesUniversePath,
  typeOf,
  Untranslatable,
  wishedBindingOf,
  wishStateOf,
} from "./vocabulary.ts";

/** Something worth saying about one cell, one row, or the sheets as a whole. */
export type Finding = {
  /** Where it was found: a tab name, or `the sheets` for something about all of them. */
  readonly where: string;
  /** The spreadsheet row, when it is about one. */
  readonly line: number | null;
  readonly said: string;
};

export type SeriesPlan = {
  readonly key: string;
  readonly name: string;
  readonly publisher: string;
  readonly editionLine: string | null;
  readonly publishedCount: number;
  readonly status: "ongoing" | "concluded";
  readonly collectingSince: string | null;
};

export type PathPlan = {
  readonly key: string;
  readonly name: string;
  readonly intent: string | null;
  readonly active: boolean;
};

export type StoryPlan = { readonly key: string; readonly title: string; readonly typeId: string };

export type VolumePlan = {
  readonly key: string;
  readonly title: string;
  readonly publisher: string;
  readonly editionLine: string | null;
  readonly bindingId: string;
  readonly language: string;
  readonly isbn: string | null;
  /** Only ever set on an object the house holds — see the module comment. */
  readonly seriesKey: string | null;
  readonly seriesNumber: number | null;
};

export type AcquisitionPlan = {
  readonly volumeKey: string;
  readonly acquiredOn: string | null;
  readonly pricePaid: string | null;
};

export type ReadingPlan = {
  readonly key: string;
  readonly storyKey: string;
  readonly medium: "paper" | "digital";
  readonly outcome: "finished" | "abandoned" | null;
  readonly startedOn: string | null;
  readonly endedOn: string | null;
  readonly provenanceId: string;
  readonly volumeKey: string | null;
};

export type RatingPlan = {
  readonly storyKey: string;
  readonly score: number;
  readonly prose: string | null;
  readonly provenanceId: string;
  readonly scale: "coarse" | "half-points";
  /** For the report: the cell as the sheet wrote it, and the tab it was in. */
  readonly said: string;
  readonly where: string;
};

export type WishPlan = {
  readonly volumeKey: string;
  readonly priority: number;
  readonly targetPrice: string | null;
  readonly priceFound: string | null;
  readonly shop: string | null;
  readonly closedOn: string | null;
};

/**
 * A count the database has to agree with, and where the number came from.
 *
 * `expected` is arithmetic over the **source tabs' row counts** and nothing else — never a
 * length of a plan array that was built from the same loop it would be checking, and never
 * a constant anybody typed. `from` is that arithmetic in prose, so a failure names the
 * tabs to go and look at rather than a number to go and change.
 */
export type Expectation = {
  readonly what: string;
  readonly sql: string;
  readonly expected: number;
  readonly from: string;
};

export type Plan = {
  readonly series: readonly SeriesPlan[];
  readonly paths: readonly PathPlan[];
  readonly constraints: readonly { readonly pathKey: string | null; readonly prose: string }[];
  readonly persons: readonly { readonly key: string; readonly name: string }[];
  readonly stories: readonly StoryPlan[];
  readonly credits: readonly {
    readonly storyKey: string;
    readonly personKey: string;
    readonly roleId: string;
  }[];
  readonly volumes: readonly VolumePlan[];
  readonly acquisitions: readonly AcquisitionPlan[];
  readonly volumeStories: readonly { readonly volumeKey: string; readonly storyKey: string }[];
  readonly editionNotes: readonly { readonly volumeKey: string; readonly note: string }[];
  readonly readings: readonly ReadingPlan[];
  readonly ratings: readonly RatingPlan[];
  readonly wishes: readonly WishPlan[];
  readonly pathItems: readonly {
    readonly pathKey: string;
    readonly storyKey: string;
    readonly position: number;
  }[];
  readonly expectations: readonly Expectation[];
  readonly blocking: readonly Finding[];
  readonly noted: readonly Finding[];
  /** The universes the model has no room for, and how many rows named each. */
  readonly universes: ReadonlyMap<string, number>;
  /** How many rows of each tab were read, for the report and for the arithmetic. */
  readonly counts: ReadonlyMap<string, number>;
};

/** `Sì`, `X`, `1` — the ways a sheet says yes. */
function yes(said: string | null): boolean {
  if (said === null) return false;
  return /^(s[iì]|x|1|true|v|vero|y|yes)$/i.test(said.trim());
}

const SERIES_STATUS: Record<string, "ongoing" | "concluded"> = {
  "in corso": "ongoing",
  incorso: "ongoing",
  ongoing: "ongoing",
  aperta: "ongoing",
  concluso: "concluded",
  conclusa: "concluded",
  completa: "concluded",
  completata: "concluded",
  finita: "concluded",
  concluded: "concluded",
};

const PRIORITIES: Record<string, number> = {
  alta: 1,
  "1": 1,
  subito: 1,
  media: 2,
  "2": 2,
  presto: 2,
  bassa: 3,
  "3": 3,
  "un giorno": 3,
};

/**
 * Split a cell holding several people — `ONE, Yusuke Murata`, `Jeph Loeb & Tim Sale`.
 *
 * A Credit is one person in one role (`CONTEXT.md`), so a cell naming two is two Credits
 * and never a person called "Loeb & Sale".
 */
function people(said: string | null): string[] {
  if (said === null) return [];
  return said
    .split(/\s*[,;&]\s*|\s+e\s+/i)
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

class Planner {
  readonly blocking: Finding[] = [];
  readonly noted: Finding[] = [];
  readonly universes = new Map<string, number>();

  readonly series = new Map<string, SeriesPlan>();
  readonly paths = new Map<string, PathPlan>();
  readonly constraints: { pathKey: string | null; prose: string }[] = [];
  readonly persons = new Map<string, string>();
  readonly stories = new Map<string, StoryPlan>();
  readonly credits: { storyKey: string; personKey: string; roleId: string }[] = [];
  readonly volumes: VolumePlan[] = [];
  readonly acquisitions: AcquisitionPlan[] = [];
  readonly volumeStories: { volumeKey: string; storyKey: string }[] = [];
  readonly editionNotes: { volumeKey: string; note: string }[] = [];
  readonly readings: ReadingPlan[] = [];
  readonly ratings = new Map<string, RatingPlan>();
  readonly wishes: WishPlan[] = [];
  readonly pathItems = new Map<string, { pathKey: string; storyKey: string; position: number }>();
  readonly counts = new Map<string, number>();

  /** Stories the two sheets named twice, which become one Story carrying two objects. */
  collapsedStories = 0;

  blocks(where: string, line: number | null, said: string): void {
    this.blocking.push({ where, line, said });
  }

  notes(where: string, line: number | null, said: string): void {
    this.noted.push({ where, line, said });
  }

  /** Run a translation, and turn an untranslatable cell into a blocking finding. */
  translating<T>(where: string, line: number, translate: () => T): T | undefined {
    try {
      return translate();
    } catch (error) {
      if (error instanceof Untranslatable) {
        this.blocks(where, line, error.message);
        return undefined;
      }
      throw error;
    }
  }

  personKey(name: string): string {
    const key = `person:${nameKey(name)}`;
    if (!this.persons.has(key)) this.persons.set(key, name);
    return key;
  }

  /**
   * The Story a row is about, created the first time a title is seen.
   *
   * Granularity is the owner's choice, case by case (`CONTEXT.md`), and this is the only
   * choice an import is entitled to make on their behalf: **the same title is the same
   * Story.** That is what lets *L'uomo che ride*'s three stories stay three and twenty
   * volumes of *Slam Dunk* collapse into one — in both cases because of what the owner
   * typed, not because of anything decided here. Every collapse is counted and the count
   * is in the report, since it is the one place a hundred rows can become ninety-four
   * without anybody asking for it.
   */
  storyKey(title: string, typeId: string): string {
    const key = `story:${typeId}:${nameKey(title)}`;
    if (this.stories.has(key)) {
      this.collapsedStories += 1;
      return key;
    }
    this.stories.set(key, { key, title, typeId });
    return key;
  }

  /** One score per Story, and two rows disagreeing about it is a blocking finding. */
  rates(rating: RatingPlan): void {
    const standing = this.ratings.get(rating.storyKey);
    if (standing === undefined) {
      this.ratings.set(rating.storyKey, rating);
      return;
    }
    if (standing.score !== rating.score) {
      this.blocks(
        rating.where,
        null,
        `two rows judge the same Story differently — ${standing.said} in ${standing.where} ` +
          `and ${rating.said} here. One Story has one score; the sheets have to agree first.`
      );
    }
  }

  placesOnPath(pathKey: string, storyKey: string): void {
    const key = `${pathKey}|${storyKey}`;
    if (this.pathItems.has(key)) return;
    // Position is the order the sheet lists them in. The order of a Path is a judgement
    // and never a publication sequence (`CONTEXT.md`) — and the judgement already made is
    // the order the owner typed.
    const position = [...this.pathItems.values()].filter((item) => item.pathKey === pathKey).length;
    this.pathItems.set(key, { pathKey, storyKey, position: position + 1 });
  }

  /**
   * The score a `Voto` cell holds, on the scale its sheet uses.
   *
   * Two scales and one column name, which is the arithmetic half of ADR-0008. The books
   * sheet's 1–5 doubles onto the owner's 1–10 and the doubling is recorded as the score's
   * **grain** — `coarse` — while its Provenance goes on saying where the judgement came
   * from. A cell outside the scale its own sheet declares is a blocking finding: a 7 in a
   * 1–5 column is a typo or a scale nobody wrote down, and both are for the owner.
   */
  scoreOf(
    where: string,
    line: number,
    said: string,
    scale: "coarse" | "half-points"
  ): number | undefined {
    const written = said.replace(",", ".").replace(/\s*\/\s*(5|10)\s*$/, "");
    const value = Number(written);
    if (!Number.isFinite(value)) {
      this.blocks(where, line, `Voto: "${said}" is not a score.`);
      return undefined;
    }
    const ceiling = scale === "coarse" ? 5 : 10;
    if (value < 1 || value > ceiling) {
      this.blocks(where, line, `Voto: ${said} is outside the 1-${ceiling} this tab is on.`);
      return undefined;
    }
    const score = scale === "coarse" ? value * 2 : value;
    if (score * 2 !== Math.trunc(score * 2)) {
      this.blocks(where, line, `Voto: ${said} is finer than half points.`);
      return undefined;
    }
    return score;
  }
}

/** The names the two sheets declare, so a cell's parts can be recognised. */
function declaredNames(sheets: Sheets): {
  series: ReadonlySet<string>;
  paths: ReadonlySet<string>;
} {
  const series = new Set<string>();
  const paths = new Set<string>();

  for (const row of sheets.seriesAndPaths.rows) {
    const named = row.value("Serie / Universo", "Serie");
    if (named !== null) {
      // Only the first part: this tab's own cell can carry a universe too, and a Series
      // is the line a publisher prints.
      const first = named.split(/\s*[/|·•]\s*|\s+[–—]\s+/)[0]?.trim();
      if (first) series.add(nameKey(first));
    }
    const route = row.value("Percorso", "Percorsi");
    if (route !== null) paths.add(nameKey(route));
  }
  for (const row of sheets.booksPaths.rows) {
    const route = row.value("Percorso", "Nome");
    if (route !== null) paths.add(nameKey(route));
  }

  return { series, paths };
}

/** Read the whole export and say what it means. */
export function planImport(sheets: Sheets): Plan {
  const planner = new Planner();
  const declared = declaredNames(sheets);

  planSeriesAndPaths(planner, sheets.seriesAndPaths);
  planBooksPaths(planner, sheets.booksPaths);
  const collezione = planCollezione(planner, sheets.collezione, declared);
  const comicsWishes = planComicsWishlist(planner, sheets.comicsWishlist, declared);
  const biblioteca = planBiblioteca(planner, sheets.biblioteca);
  const booksWishes = planBooksWishlist(planner, sheets.booksWishlist, declared);
  planBooksPathItems(planner, sheets.booksPaths);
  checkMaster(planner, sheets);
  checkLists(planner, sheets);
  countInboxes(planner, sheets);

  for (const tab of [
    sheets.collezione,
    sheets.comicsWishlist,
    sheets.seriesAndPaths,
    sheets.biblioteca,
    sheets.booksWishlist,
    sheets.booksPaths,
  ]) {
    planner.counts.set(tab.name, tab.rows.length);
  }

  const expectations = expectationsOf(planner, {
    collezione,
    comicsWishes,
    biblioteca,
    booksWishes,
  });

  return {
    series: [...planner.series.values()],
    paths: [...planner.paths.values()],
    constraints: planner.constraints,
    persons: [...planner.persons.entries()].map(([key, name]) => ({ key, name })),
    stories: [...planner.stories.values()],
    credits: planner.credits,
    volumes: planner.volumes,
    acquisitions: planner.acquisitions,
    volumeStories: planner.volumeStories,
    editionNotes: planner.editionNotes,
    readings: planner.readings,
    ratings: [...planner.ratings.values()],
    wishes: planner.wishes,
    pathItems: [...planner.pathItems.values()],
    expectations,
    blocking: planner.blocking,
    noted: planner.noted,
    universes: planner.universes,
    counts: planner.counts,
  };
}

// ── Serie e Percorsi ───────────────────────────────────────────────────────

function planSeriesAndPaths(planner: Planner, tab: Tab): void {
  for (const row of tab.rows) {
    const named = row.value("Serie / Universo", "Serie");
    const route = row.value("Percorso", "Percorsi");

    if (named !== null) {
      const parts = named
        .split(/\s*[/|·•]\s*|\s+[–—]\s+/)
        .map((part) => part.trim())
        .filter((part) => part !== "");
      const name = parts.shift();
      if (name === undefined) continue;
      for (const universe of parts) {
        planner.universes.set(universe, (planner.universes.get(universe) ?? 0) + 1);
      }

      const publisher = row.value("Editore", "Publisher");
      if (publisher === null) {
        planner.blocks(tab.name, row.line, `${name}: a Series needs its publisher.`);
      } else {
        const statusSaid = row.value("Stato", "Stato serie");
        const status = statusSaid === null ? "ongoing" : SERIES_STATUS[nameKey(statusSaid)];
        if (status === undefined) {
          planner.blocks(tab.name, row.line, `Stato: "${statusSaid}" is not ongoing or concluded.`);
        } else {
          const published = integerOf(row.value("Volumi usciti", "Volumi", "Usciti"));
          if (published === null) {
            planner.notes(
              tab.name,
              row.line,
              `${name}: no published count in the sheet, recorded as 0 — the ledger is the ` +
                "owner's knowledge and it grows."
            );
          }
          const key = `series:${nameKey(name)}`;
          if (!planner.series.has(key)) {
            planner.series.set(key, {
              key,
              name,
              publisher,
              editionLine: row.value("Edizione", "Edition", "Linea"),
              publishedCount: published ?? 0,
              status,
              // Collecting a Series is a deliberate decision and never derived from
              // ownership (`CONTEXT.md`). The sheet's own column is that decision; the day
              // is the day it is read into the library, because the sheet never wrote one.
              collectingSince: yes(row.value("In raccolta", "Raccolgo", "Collezionata"))
                ? (dayOf(row.value("Raccolta dal", "Dal")) ?? today())
                : null,
            });
          }
        }
      }
    }

    if (route !== null) definePath(planner, row, route);
  }
}

function planBooksPaths(planner: Planner, tab: Tab): void {
  for (const row of tab.rows) {
    const route = row.value("Percorso", "Nome");
    if (route === null) continue;
    definePath(planner, row, route);
    if (row.value("Prossimo") !== null) {
      planner.notes(
        tab.name,
        row.line,
        `${route}: the "Prossimo" cell is dropped — what comes next is the Reading list ` +
          "composing itself, which is the column the owner stops maintaining by hand."
      );
    }
  }
}

function definePath(planner: Planner, row: TabRow, route: string): void {
  const key = `path:${nameKey(route)}`;
  if (!planner.paths.has(key)) {
    planner.paths.set(key, {
      key,
      name: route,
      intent: row.value("Intento", "Intento percorso", "Intenzione", "Descrizione"),
      active: !yes(row.value("Sospeso", "Chiuso", "Inattivo")),
    });
  }
  const prose = row.value("Vincoli", "Vincolo", "Regole");
  // The same Path is declared on both sheets' Paths tabs, so the same sentence can arrive
  // twice. A constraint said twice is one constraint: it is prose the advisor reads, and
  // repeating it changes nothing except how often it is read.
  if (prose !== null && !planner.constraints.some((s) => s.pathKey === key && s.prose === prose)) {
    planner.constraints.push({ pathKey: key, prose });
  }
}

// ── Collezione ─────────────────────────────────────────────────────────────

type Owned = {
  /** Rows that became a Reading, which is where the reading state column went. */
  readonly read: number;
  /** Rows carrying a score. */
  readonly rated: number;
};

function planCollezione(
  planner: Planner,
  tab: Tab,
  declared: { series: ReadonlySet<string>; paths: ReadonlySet<string> }
): Owned {
  let read = 0;
  let rated = 0;

  for (const row of tab.rows) {
    const title = row.value("Titolo", "Volume");
    const publisher = row.value("Editore", "Publisher");
    const saidType = row.value("Tipo");
    const saidBinding = row.value("Formato");

    if (title === null || publisher === null || saidType === null || saidBinding === null) {
      planner.blocks(
        tab.name,
        row.line,
        "a Volume needs a title, a publisher, a Tipo and a Formato; this row is missing one."
      );
      continue;
    }

    const typeId = planner.translating(tab.name, row.line, () => typeOf(saidType));
    const bindingId = planner.translating(tab.name, row.line, () => bindingOf(saidBinding));
    const language = planner.translating(tab.name, row.line, () =>
      languageOf(row.value("Lingua", "Language"))
    );
    if (typeId === undefined || bindingId === undefined || language === undefined) continue;

    // The three-in-one column, taken apart before anything is trusted.
    const said = row.value("Serie / Universo", "Serie");
    const split =
      said === null
        ? { series: null, universe: null, path: null }
        : splitSeriesUniversePath(said, declared);
    if (split.universe !== null) {
      planner.universes.set(split.universe, (planner.universes.get(split.universe) ?? 0) + 1);
    }

    const volumeKey = `volume:${tab.name}:${row.line}`;
    const seriesKey = split.series === null ? null : `series:${nameKey(split.series)}`;
    const seriesNumber = integerOf(row.value("Numero", "N.", "Vol."));
    const placed = seriesKey !== null && planner.series.has(seriesKey) && seriesNumber !== null;
    if (seriesKey !== null && !planner.series.has(seriesKey)) {
      planner.notes(
        tab.name,
        row.line,
        `"${split.series}" is not a Series declared in Serie e Percorsi, so this object is ` +
          "catalogued outside any ledger. A Series is a deliberate declaration, not a " +
          "side effect of typing its name on a row."
      );
    }

    planner.volumes.push({
      key: volumeKey,
      title,
      publisher,
      editionLine: row.value("Edizione", "Linea", "Edition"),
      bindingId,
      language,
      isbn: normaliseIsbn(planner, tab, row),
      seriesKey: placed ? seriesKey : null,
      seriesNumber: placed ? seriesNumber : null,
    });

    // The object is on the shelf: one open acquisition, with the receipt where there is
    // one. Cataloguing and acquiring are two acts (ADR-0007) and this row states both.
    planner.acquisitions.push({
      volumeKey,
      acquiredOn: dayOf(row.value("Data acquisto", "Acquistato il", "Data")),
      pricePaid: amountOf(row.value("Prezzo", "Prezzo pagato", "Costo")),
    });

    const storyKey = planner.storyKey(title, typeId);
    planner.volumeStories.push({ volumeKey, storyKey });

    const note = row.value("Note edizione", "Note volume", "Giudizio edizione");
    if (note !== null) planner.editionNotes.push({ volumeKey, note });

    for (const [column, roleId] of [
      ["Sceneggiatura", "writer"],
      ["Disegni", "artist"],
    ] as const) {
      for (const name of people(
        row.value(column, column === "Disegni" ? "Disegnatore" : "Autore")
      )) {
        planner.credits.push({ storyKey, personKey: planner.personKey(name), roleId });
      }
    }

    const provenanceId = planner.translating(tab.name, row.line, () =>
      provenanceOf(row.value("Provenienza"))
    );
    if (provenanceId === undefined) continue;

    let readingKey: string | null = null;
    const saidState = row.value("Stato lettura", "Stato");
    if (saidState !== null) {
      const state = planner.translating(tab.name, row.line, () => readingStateOf(saidState));
      if (state === undefined) continue;
      if (state.read) {
        read += 1;
        readingKey = `reading:${tab.name}:${row.line}`;
        planner.readings.push({
          key: readingKey,
          storyKey,
          // Every Reading off this sheet is paper: the sheet is a shelf, and an owned
          // ebook is not a thing the model has (`CONTEXT.md`).
          medium: "paper",
          outcome: state.outcome,
          startedOn: dayOf(row.value("Data inizio", "Iniziato il")),
          endedOn: state.outcome === null ? null : dayOf(row.value("Data fine", "Finito il")),
          provenanceId,
          volumeKey,
        });
      }
    }

    const saidScore = row.value("Voto", "Voto storia");
    if (saidScore !== null) {
      // This sheet's column is already the owner's own scale: 1-10, half points.
      const score = planner.scoreOf(tab.name, row.line, saidScore, "half-points");
      if (score !== undefined) {
        rated += 1;
        planner.rates({
          storyKey,
          score,
          prose: row.value("Commento", "Recensione", "Note lettura"),
          provenanceId,
          scale: "half-points",
          said: saidScore,
          where: tab.name,
        });
      }
    }

    if (split.path !== null) {
      const pathKey = `path:${nameKey(split.path)}`;
      if (planner.paths.has(pathKey)) planner.placesOnPath(pathKey, storyKey);
      else {
        planner.notes(
          tab.name,
          row.line,
          `"${split.path}" reads as a Path and is declared nowhere, so nothing was placed ` +
            "on it. A Path is the owner's own route and is declared, never inferred."
        );
      }
    }
  }

  return { read, rated };
}

function normaliseIsbn(planner: Planner, tab: Tab, row: TabRow): string | null {
  const said = row.value("ISBN", "EAN", "Codice");
  if (said === null) return null;
  const digits = said.replace(/[^0-9Xx]/g, "");
  if (/^[0-9]{9}[0-9Xx]$/.test(digits) || /^[0-9]{13}$/.test(digits)) return digits;
  planner.notes(
    tab.name,
    row.line,
    `ISBN "${said}" is neither ten nor thirteen characters, so the object is catalogued ` +
      "without one rather than with a wrong one."
  );
  return null;
}

// ── The two Wishlists ──────────────────────────────────────────────────────

type Wanted = {
  /** Rows whose `Stato` said the object came home: a Wish that ended, and an acquisition. */
  readonly acquired: number;
  /** Rows whose intention is over, however it ended — `acquired` among them. */
  readonly ended: number;
  /** Rows the model has nothing for — a wanted file. */
  readonly unrepresentable: number;
  /** Rows naming a Series position that cannot be written. */
  readonly unplaced: number;
};

function planComicsWishlist(
  planner: Planner,
  tab: Tab,
  declared: { series: ReadonlySet<string>; paths: ReadonlySet<string> }
): Wanted {
  let acquired = 0;
  let ended = 0;
  let unplaced = 0;

  for (const row of tab.rows) {
    const title = row.value("Titolo", "Volume");
    const publisher = row.value("Editore", "Publisher");
    const saidBinding = row.value("Formato");
    if (title === null || publisher === null || saidBinding === null) {
      planner.blocks(
        tab.name,
        row.line,
        "a wanted Volume still needs a title, a publisher and a Formato."
      );
      continue;
    }

    const bindingId = planner.translating(tab.name, row.line, () => bindingOf(saidBinding));
    const language = planner.translating(tab.name, row.line, () =>
      languageOf(row.value("Lingua", "Language"))
    );
    if (bindingId === undefined || language === undefined) continue;

    const saidState = row.value("Stato", "Stato wishlist");
    const state =
      saidState === null
        ? { open: true, acquired: false }
        : planner.translating(tab.name, row.line, () => wishStateOf(saidState));
    if (state === undefined) continue;

    const said = row.value("Serie / Universo", "Serie");
    const split =
      said === null
        ? { series: null, universe: null, path: null }
        : splitSeriesUniversePath(said, declared);
    if (split.universe !== null) {
      planner.universes.set(split.universe, (planner.universes.get(split.universe) ?? 0) + 1);
    }

    const volumeKey = `volume:${tab.name}:${row.line}`;
    const seriesNumber = integerOf(row.value("Numero", "N.", "Vol."));

    // ADR-0007's open question, arriving exactly where #14 was named as the ticket that
    // might reopen it. The row names a position of a Series and the house does not hold
    // the object, and **placing a Volume in a Series asks that the house hold it** —
    // unchanged by ADR-0007 and deliberately left standing there. So the position is
    // reported and not written. The ledger loses nothing: a position with no owned object
    // in it is missing either way.
    if (!state.acquired && split.series !== null && seriesNumber !== null) {
      unplaced += 1;
      planner.notes(
        tab.name,
        row.line,
        `wants ${split.series} ${seriesNumber}, and a Volume the house does not hold ` +
          "cannot be given a position in a Series (ADR-0007). It is catalogued and wished " +
          "for; the position is not written. Whether the ledger should let a wanted object " +
          "be pinned to a position is a decision nobody has taken."
      );
    }

    const seriesKey = split.series === null ? null : `series:${nameKey(split.series)}`;
    const placeable = state.acquired && seriesKey !== null && planner.series.has(seriesKey);

    planner.volumes.push({
      key: volumeKey,
      title,
      publisher,
      editionLine: row.value("Edizione", "Linea", "Edition"),
      bindingId,
      language,
      isbn: normaliseIsbn(planner, tab, row),
      seriesKey: placeable ? seriesKey : null,
      seriesNumber: placeable ? seriesNumber : null,
    });

    const priority = PRIORITIES[nameKey(row.value("Priorità", "Priorita", "Priority") ?? "media")];
    if (priority === undefined) {
      planner.blocks(tab.name, row.line, "Priorità: a Wish is 1 next, 2 soon or 3 someday.");
      continue;
    }

    if (state.acquired) {
      // `Acquistato` is not a state of wanting. It is two facts: the object is in the
      // house, and the intention that led there is over.
      acquired += 1;
      ended += 1;
      const acquiredOn = dayOf(row.value("Data acquisto", "Acquistato il", "Data"));
      planner.acquisitions.push({
        volumeKey,
        acquiredOn,
        pricePaid: amountOf(row.value("Prezzo trovato", "Prezzo pagato", "Prezzo")),
      });
      planner.wishes.push({
        volumeKey,
        priority,
        targetPrice: amountOf(row.value("Prezzo obiettivo", "Prezzo target")),
        priceFound: amountOf(row.value("Prezzo trovato", "Trovato a")),
        shop: row.value("Negozio", "Shop", "Dove"),
        closedOn: acquiredOn ?? today(),
      });
      planner.notes(
        tab.name,
        row.line,
        `Stato "${saidState}" is not a wish state: read as a Wish that ended and an object ` +
          "in the house."
      );
      continue;
    }

    if (!state.open) {
      ended += 1;
      planner.notes(
        tab.name,
        row.line,
        `Stato "${saidState}": the intention is over and the object never came home, so the ` +
          "object is catalogued and the Wish is closed."
      );
    }

    planner.wishes.push({
      volumeKey,
      priority,
      targetPrice: amountOf(row.value("Prezzo obiettivo", "Prezzo target")),
      priceFound: amountOf(row.value("Prezzo trovato", "Trovato a")),
      shop: row.value("Negozio", "Shop", "Dove"),
      closedOn: state.open ? null : today(),
    });
  }

  return { acquired, ended, unrepresentable: 0, unplaced };
}

function planBooksWishlist(
  planner: Planner,
  tab: Tab,
  declared: { series: ReadonlySet<string>; paths: ReadonlySet<string> }
): Wanted {
  let unrepresentable = 0;

  for (const row of tab.rows) {
    const title = row.value("Titolo", "Libro");
    const saidBinding = row.value("Formato");
    if (title === null || saidBinding === null) {
      planner.blocks(tab.name, row.line, "a wanted book needs a title and a Formato.");
      continue;
    }

    const bindingId = planner.translating(tab.name, row.line, () => wishedBindingOf(saidBinding));
    if (bindingId === undefined) continue;
    if (bindingId === null) {
      // A Wish names a Volume, and digital ownership is deliberately not modelled: a file
      // is not something the owner collects (`CONTEXT.md`). There is nothing to name.
      unrepresentable += 1;
      planner.notes(
        tab.name,
        row.line,
        `"${title}" is wanted as a file, and a Wish names a Volume. Digital ownership is ` +
          "deliberately not modelled, so this row is not imported: an ebook is a Reading " +
          "with a digital medium, recorded when it is read."
      );
      continue;
    }

    const publisher = row.value("Editore", "Publisher");
    if (publisher === null) {
      planner.blocks(tab.name, row.line, "a wanted Volume needs its publisher.");
      continue;
    }
    const language = planner.translating(tab.name, row.line, () =>
      languageOf(row.value("Lingua", "Language"))
    );
    if (language === undefined) continue;

    const said = row.value("Serie / Universo", "Serie", "Collana");
    if (said !== null) {
      const split = splitSeriesUniversePath(said, declared);
      if (split.universe !== null) {
        planner.universes.set(split.universe, (planner.universes.get(split.universe) ?? 0) + 1);
      }
    }

    const volumeKey = `volume:${tab.name}:${row.line}`;
    planner.volumes.push({
      key: volumeKey,
      title,
      publisher,
      editionLine: row.value("Edizione", "Collana", "Linea"),
      bindingId,
      language,
      isbn: normaliseIsbn(planner, tab, row),
      seriesKey: null,
      seriesNumber: null,
    });

    const priority = PRIORITIES[nameKey(row.value("Priorità", "Priorita", "Priority") ?? "media")];
    if (priority === undefined) {
      planner.blocks(tab.name, row.line, "Priorità: a Wish is 1 next, 2 soon or 3 someday.");
      continue;
    }
    planner.wishes.push({
      volumeKey,
      priority,
      targetPrice: amountOf(row.value("Prezzo obiettivo", "Prezzo target")),
      priceFound: amountOf(row.value("Prezzo trovato", "Trovato a")),
      shop: row.value("Negozio", "Shop", "Dove"),
      closedOn: null,
    });
  }

  return { acquired: 0, ended: 0, unrepresentable, unplaced: 0 };
}

// ── Biblioteca ─────────────────────────────────────────────────────────────

type Readings = {
  /** Rows that became a Reading. */
  readonly read: number;
  readonly rated: number;
  readonly fromGoodreads: number;
};

function planBiblioteca(planner: Planner, tab: Tab): Readings {
  let read = 0;
  let rated = 0;
  let fromGoodreads = 0;

  for (const row of tab.rows) {
    const title = row.value("Titolo", "Libro");
    const saidType = row.value("Tipo");
    const saidMedium = row.value("Formato");
    if (title === null || saidType === null || saidMedium === null) {
      planner.blocks(tab.name, row.line, "a Story needs a title, a Tipo and a Formato.");
      continue;
    }

    const typeId = planner.translating(tab.name, row.line, () => typeOf(saidType));
    // The same column name as the comics sheet, and the other question entirely: here it
    // says by what medium the owner read, which is a fact about the act and not the object.
    const medium = planner.translating(tab.name, row.line, () => mediumOf(saidMedium));
    const provenanceId = planner.translating(tab.name, row.line, () =>
      provenanceOf(row.value("Provenienza", "Fonte"))
    );
    if (typeId === undefined || medium === undefined || provenanceId === undefined) continue;
    if (provenanceId === "goodreads-history") fromGoodreads += 1;

    const storyKey = planner.storyKey(title, typeId);

    for (const name of people(row.value("Autore", "Autori", "Scrittore"))) {
      planner.credits.push({ storyKey, personKey: planner.personKey(name), roleId: "writer" });
    }

    const saidState = row.value("Stato", "Stato lettura");
    const state =
      saidState === null
        ? { read: true, outcome: "finished" as const }
        : planner.translating(tab.name, row.line, () => readingStateOf(saidState));
    if (state === undefined) continue;

    // **Every row of this sheet is a Reading with no Volume**, which is the whole reason
    // the model separates the two: being read and being owned are unrelated facts
    // (ADR-0001), and Goodreads history is testimony about reading and says nothing about
    // a shelf. A row that was not read at all is a Story with no Reading rather than an
    // invented one.
    if (state.read) {
      read += 1;
      planner.readings.push({
        key: `reading:${tab.name}:${row.line}`,
        storyKey,
        medium,
        outcome: state.outcome,
        startedOn: dayOf(row.value("Data inizio", "Iniziato il", "Iniziata il")),
        endedOn:
          state.outcome === null
            ? null
            : dayOf(row.value("Data fine", "Finito il", "Data", "Letto il")),
        provenanceId,
        volumeKey: null,
      });
    } else {
      planner.notes(
        tab.name,
        row.line,
        `"${title}" is on the books sheet and not read yet, so it is a Story with no ` +
          "Reading. Nothing is invented to stand for an act that has not happened."
      );
    }

    const saidScore = row.value("Voto", "Valutazione");
    if (saidScore !== null) {
      // ADR-0008, in one line: the 1-5 doubles onto the owner's scale, the doubling is
      // recorded as the score's grain, and the Provenance goes on saying where it came
      // from. A coarse 8 off Goodreads and a coarse 8 typed off the shelf are two
      // different things and both are now sayable.
      const score = planner.scoreOf(tab.name, row.line, saidScore, "coarse");
      if (score !== undefined) {
        rated += 1;
        planner.rates({
          storyKey,
          score,
          prose: row.value("Note", "Commento", "Recensione"),
          provenanceId,
          scale: "coarse",
          said: saidScore,
          where: tab.name,
        });
      }
    }
  }

  return { read, rated, fromGoodreads };
}

// ── Percorsi's ordered titles ──────────────────────────────────────────────

function planBooksPathItems(planner: Planner, tab: Tab): void {
  for (const row of tab.rows) {
    const route = row.value("Percorso", "Nome");
    if (route === null) continue;
    const pathKey = `path:${nameKey(route)}`;
    const listed = row.value("Titoli", "Storie", "Tappe");
    if (listed === null) continue;

    for (const title of listed
      .split(/\s*[;|]\s*|\s*→\s*/)
      .map((part) => part.trim())
      .filter((part) => part !== "")) {
      const found = [...planner.stories.values()].filter(
        (story) => nameKey(story.title) === nameKey(title)
      );
      if (found.length === 0) {
        planner.notes(
          tab.name,
          row.line,
          `"${title}" is a stop on ${route} and neither sheet has a row for it, so the ` +
            "Path is imported without it. A Path is an ordered route through Stories the " +
            "library knows."
        );
        continue;
      }
      for (const story of found) planner.placesOnPath(pathKey, story.key);
    }
  }
}

// ── The tabs that are read only to be checked ──────────────────────────────

/**
 * `Master` is a column subset of `Collezione`, so it contributes nothing and is worth
 * exactly one question: does it still agree?
 *
 * A title in `Master` that `Collezione` does not have is a row the owner edited on one tab
 * and not the other, and it is the kind of thing an import is the last chance to notice.
 */
function checkMaster(planner: Planner, sheets: Sheets): void {
  const master = sheets.master;
  if (master === null) return;

  const known = new Set(
    sheets.collezione.rows
      .map((row) => row.value("Titolo", "Volume"))
      .filter((title): title is string => title !== null)
      .map(nameKey)
  );

  const stray = master.rows
    .map((row) => ({ line: row.line, title: row.value("Titolo", "Volume") }))
    .filter((row) => row.title !== null && !known.has(nameKey(row.title)));

  for (const row of stray) {
    planner.notes(
      master.name,
      row.line,
      `"${row.title}" is in Master and not in Collezione. Master is a column subset of ` +
        "Collezione and imports nothing, so this row does not enter the library."
    );
  }
  planner.notes(
    master.name,
    null,
    `${master.rows.length} rows read and 0 imported: Master is a column subset of ` +
      `Collezione, and ${master.rows.length - stray.length} of its titles are on it.`
  );
}

/**
 * `Liste` holds the validation vocabularies the other tabs' cells were chosen from, so it
 * is the one tab that can be checked **before** a row uses it.
 *
 * Every value in it crosses the same tables the rows cross. A value nothing happens to use
 * today is still a value the owner will pick tomorrow, and finding out then — from a
 * screen, on one row — is worse than finding out here.
 */
function checkLists(planner: Planner, sheets: Sheets): void {
  const lists = sheets.lists;
  if (lists === null) return;

  const columns: readonly [readonly string[], (said: string) => unknown][] = [
    [["Tipo"], typeOf],
    [["Formato"], bindingOf],
    [["Stato lettura"], readingStateOf],
    [["Stato wishlist", "Stato"], wishStateOf],
    [["Lingua"], languageOf],
    [["Provenienza"], (said: string) => provenanceOf(said)],
  ];

  let checked = 0;
  for (const [headers, translate] of columns) {
    if (!lists.has(...headers)) continue;
    for (const row of lists.rows) {
      const said = row.value(...headers);
      if (said === null) continue;
      checked += 1;
      planner.translating(lists.name, row.line, () => translate(said));
    }
  }
  planner.notes(
    lists.name,
    null,
    `${checked} vocabulary values checked against the model's words before a row used them.`
  );
}

/**
 * The two `Inbox` tabs are counted and imported nowhere.
 *
 * The Inbox is where an **assistant** proposes an entity the owner then approves
 * (ADR-0005). The import is the owner's own deliberate act, so it enters the library
 * directly: routing it through the Inbox would ask the owner to approve his own
 * spreadsheet, one row at a time.
 */
function countInboxes(planner: Planner, sheets: Sheets): void {
  for (const inbox of sheets.inboxes) {
    planner.notes(
      inbox.name,
      null,
      `${inbox.rows.length} row(s) read and 0 imported. The Inbox is where an assistant ` +
        "proposes and the owner approves; this import is the owner's own act and goes " +
        "straight in."
    );
  }
}

// ── The counts the database has to agree with ──────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function expectationsOf(
  planner: Planner,
  measured: {
    collezione: Owned;
    comicsWishes: Wanted;
    biblioteca: Readings;
    booksWishes: Wanted;
  }
): readonly Expectation[] {
  const collezione = planner.counts.get("Collezione") ?? 0;
  const comicsWishlist = planner.counts.get("Wishlist (Collezione)") ?? 0;
  const biblioteca = planner.counts.get("Biblioteca") ?? 0;
  const booksWishlist = planner.counts.get("Wishlist (Biblioteca)") ?? 0;
  const wantedBooks = booksWishlist - measured.booksWishes.unrepresentable;
  const acquiredWishes = measured.comicsWishes.acquired;
  const endedWishes = measured.comicsWishes.ended;

  return [
    {
      what: "catalogued Volumes",
      sql: "select count(*) from volume",
      expected: collezione + comicsWishlist + wantedBooks,
      from:
        `Collezione ${collezione} + Wishlist (Collezione) ${comicsWishlist} + ` +
        `Wishlist (Biblioteca) ${booksWishlist} - ${measured.booksWishes.unrepresentable} ` +
        "wanting a file",
    },
    {
      what: "Volumes in the Collection (an open acquisition)",
      sql: "select count(*) from acquisition where released_on is null",
      expected: collezione + acquiredWishes,
      from: `Collezione ${collezione} + ${acquiredWishes} wishlist row(s) saying Acquistato`,
    },
    {
      what: "Volumes catalogued and never in the house",
      sql: "select count(*) from volume v where not exists (select 1 from acquisition a where a.volume_id = v.id)",
      expected: comicsWishlist - acquiredWishes + wantedBooks,
      from:
        `Wishlist (Collezione) ${comicsWishlist} - ${acquiredWishes} Acquistato + ` +
        `${wantedBooks} wanted book(s) — ADR-0007's whole point`,
    },
    {
      what: "open Wishes",
      sql: "select count(*) from wish where closed_on is null",
      expected: comicsWishlist - endedWishes + wantedBooks,
      from:
        `Wishlist (Collezione) ${comicsWishlist} - ${endedWishes} whose intention is over + ` +
        `${wantedBooks} wanted book(s)`,
    },
    {
      what: "Wishes that ended",
      sql: "select count(*) from wish where closed_on is not null",
      expected: endedWishes,
      from:
        `${acquiredWishes} row(s) saying Acquistato — a Wish that ended and not a wish ` +
        `state — and ${endedWishes - acquiredWishes} given up on`,
    },
    {
      what: "Stories",
      sql: "select count(*) from story",
      expected: collezione + biblioteca - planner.collapsedStories,
      from:
        `Collezione ${collezione} + Biblioteca ${biblioteca} - ${planner.collapsedStories} ` +
        "row(s) naming a title another row already named",
    },
    {
      what: "Readings",
      sql: "select count(*) from reading",
      expected: measured.collezione.read + measured.biblioteca.read,
      from:
        `${measured.collezione.read} Collezione row(s) that say they were read + ` +
        `${measured.biblioteca.read} Biblioteca row(s) that do`,
    },
    {
      what: "Readings through no Volume",
      sql: "select count(*) from reading where volume_id is null",
      expected: planner.readings.filter((reading) => reading.volumeKey === null).length,
      from: "every Biblioteca row: a book read is a Reading, and the shelf is another question",
    },
    {
      what: "Goodreads Readings, none of which passes through a Volume",
      sql: "select count(*) from reading where provenance_id = 'goodreads-history' and volume_id is not null",
      expected: 0,
      from: `the ${measured.biblioteca.fromGoodreads} Goodreads row(s) land as a Story and a Reading, with no Volume`,
    },
    {
      what: "Ratings",
      sql: "select count(*) from rating",
      expected: planner.ratings.size,
      from: `${measured.collezione.rated} Collezione + ${measured.biblioteca.rated} Biblioteca row(s) with a Voto, one score per Story`,
    },
    {
      what: "Ratings given in half points",
      sql: "select count(*) from rating where scale = 'half-points'",
      expected: [...planner.ratings.values()].filter((r) => r.scale === "half-points").length,
      from: "the Collezione Voto column, which is already the owner's own 1-10",
    },
    {
      what: "Ratings doubled off a 1-5 column, and marked coarse",
      sql: "select count(*) from rating where scale = 'coarse'",
      expected: [...planner.ratings.values()].filter((r) => r.scale === "coarse").length,
      from: `the Biblioteca Voto column: ${measured.biblioteca.rated} score(s) out of 5, doubled (ADR-0008)`,
    },
    {
      what: "Ratings still carrying the retired coarse Provenance",
      sql: "select count(*) from rating where provenance_id = 'converted-from-a-coarser-scale'",
      expected: 0,
      from: "ADR-0008 retired that row: the grain is an axis of its own, not an origin",
    },
    {
      what: "Series",
      sql: "select count(*) from series",
      expected: planner.series.size,
      from: `the ${planner.counts.get("Serie e Percorsi") ?? 0} rows of Serie e Percorsi`,
    },
    {
      what: "Paths",
      sql: "select count(*) from path",
      expected: planner.paths.size,
      from: `Serie e Percorsi ${planner.counts.get("Serie e Percorsi") ?? 0} + Percorsi ${planner.counts.get("Percorsi") ?? 0} rows`,
    },
    {
      what: "Volumes given a position in a Series",
      sql: "select count(*) from volume where series_id is not null",
      expected: planner.volumes.filter((volume) => volume.seriesKey !== null).length,
      from:
        `${measured.comicsWishes.unplaced} wanted position(s) are reported and not written: ` +
        "placing a Volume in a Series asks that the house hold it (ADR-0007)",
    },
    {
      what: "Volumes given a position the house does not hold",
      sql:
        "select count(*) from volume v where v.series_id is not null and not exists " +
        "(select 1 from acquisition a where a.volume_id = v.id and a.released_on is null)",
      expected: 0,
      from: "ADR-0007's standing rule, which this import honours rather than loosening",
    },
    {
      what: "which Stories a Volume carries",
      sql: "select count(*) from volume_story",
      expected: planner.volumeStories.length,
      from: `one per Collezione row: ${collezione}, over the Stories they collapse into`,
    },
    {
      what: "Credits",
      sql: "select count(*) from credit",
      expected: new Set(
        planner.credits.map((credit) => `${credit.storyKey}|${credit.personKey}|${credit.roleId}`)
      ).size,
      from: "the Sceneggiatura and Disegni columns of Collezione, and Autore on Biblioteca",
    },
    {
      what: "Path stops",
      sql: "select count(*) from path_item",
      expected: planner.pathItems.size,
      from: "the Path part of Serie / Universo, and the ordered titles on Percorsi",
    },
    {
      what: "Edition notes",
      sql: "select count(*) from edition_note",
      expected: planner.editionNotes.length,
      from: "the Note edizione column of Collezione: what the owner thinks of the object",
    },
    {
      what: "declared constraints",
      sql: "select count(*) from declared_constraint",
      expected: planner.constraints.length,
      from: "the Vincoli cells on the two Paths tabs, in the owner's own words",
    },
  ];
}
