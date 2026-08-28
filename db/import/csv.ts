// A tab of a Google Sheet, exported as CSV and read as rows.
//
// Small and dependency-free on purpose. The import runs once, from a directory of files
// the owner exported by hand, so the whole of what a parser has to survive here is what
// Sheets writes: quoted fields containing commas and newlines, doubled quotes inside a
// quoted field, and a trailing newline. Nothing else is worth a dependency in the
// lockfile every other slice has to merge.
//
// Two things this file decides, and they are both about honesty rather than parsing:
//
//   - **A header is matched loosely, and a missing one is named loudly.** The owner's
//     tabs were typed by hand over years, so `Data acquisto`, `data acquisto ` and
//     `Data Acquisto` are one column; the alternative is an import that reads a real
//     export as an empty tab. When a column the import needs is genuinely absent, the
//     error lists the headers the file actually had — that is the message that gets an
//     export fixed.
//   - **A spreadsheet error is an absent value, and it is counted.** The `Biblioteca`
//     dashboard shows `#ERROR!` on three of its five tiles, and a formula that broke on
//     a dashboard broke wherever else it was copied. `#ERROR!` is not the string a cell
//     holds; it is the cell failing to hold anything. It reads as empty and the count of
//     them appears in the report, because a tab that is 40% broken formulas is something
//     the owner has to know before the numbers are believed.

import { readFileSync } from "node:fs";

/**
 * What a spreadsheet writes into a cell instead of a value.
 *
 * Google Sheets' own error literals, plus the two Excel ones the owner's exports can
 * carry after a round trip. Compared case-insensitively and after trimming.
 */
const SPREADSHEET_ERRORS = new Set([
  "#error!",
  "#ref!",
  "#n/a",
  "#value!",
  "#div/0!",
  "#name?",
  "#null!",
  "#num!",
  "#getting_data",
  "loading...",
]);

/** Split one CSV document into rows of raw fields. */
export function parseCsv(text: string): string[][] {
  // A BOM is what a Sheets export starts with often enough to be worth one line here:
  // left in, it becomes part of the first header and the first column vanishes.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let at = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (at < source.length) {
    const character = source[at];

    if (quoted) {
      if (character === '"') {
        if (source[at + 1] === '"') {
          field += '"';
          at += 2;
          continue;
        }
        quoted = false;
        at += 1;
        continue;
      }
      field += character;
      at += 1;
      continue;
    }

    if (character === '"' && field === "") {
      quoted = true;
      at += 1;
      continue;
    }
    if (character === ",") {
      endField();
      at += 1;
      continue;
    }
    if (character === "\r") {
      at += 1;
      continue;
    }
    if (character === "\n") {
      endRow();
      at += 1;
      continue;
    }
    field += character;
    at += 1;
  }

  // A file ending in a newline has no last row; one ending mid-field does.
  if (field !== "" || row.length > 0) endRow();

  // A row of nothing but empty cells is what a sheet's unused rows export as.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/**
 * A header reduced to what two spellings of the same column have in common: letters and
 * digits, folded to lower case, accents removed.
 *
 * `Serie / Universo`, `serie/universo` and `Serie/Universo ` are one key. So are
 * `Priorità` and `Priorita`, which matters because the owner's exports have both.
 */
function key(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** One row of a tab, addressed by the header the owner typed. */
export type TabRow = {
  /** The row's number in the spreadsheet, counting the header as row 1. */
  readonly line: number;
  /**
   * The cell under one of these headers, trimmed — or `null` when it is empty, absent
   * or a spreadsheet error. The first header that exists in the tab wins, so a column
   * the owner renamed between the two sheets is given both names at the call site.
   */
  value(...headers: readonly string[]): string | null;
};

/** A tab, as the import reads it. */
export type Tab = {
  /** The tab as the owner sees it in the sheet: `Collezione`. */
  readonly name: string;
  /** The file it was read from, for the report and for an error message. */
  readonly file: string;
  /** The headers as the file spells them. */
  readonly headers: readonly string[];
  readonly rows: readonly TabRow[];
  /** Cells discarded because they held `#ERROR!` rather than a value. */
  readonly errorCells: number;
  /** Whether the tab spells one of these headers at all. */
  has(...headers: readonly string[]): boolean;
};

/**
 * Read one tab, and refuse it when a column the import needs is not there.
 *
 * The refusal carries the headers the file actually has, because the realistic failure
 * is not a missing column — it is a column called something else, in an export made
 * eighteen months after this was written.
 */
export function readTab(
  file: string,
  name: string,
  required: readonly (readonly string[])[] = []
): Tab {
  const rows = parseCsv(readFileSync(file, "utf8"));
  if (rows.length === 0) {
    throw new Error(`${name} (${file}) is empty: a tab exports with its header row at least.`);
  }

  const headers = rows[0].map((header) => header.trim());
  const index = new Map<string, number>();
  headers.forEach((header, at) => {
    const normalized = key(header);
    if (normalized !== "" && !index.has(normalized)) index.set(normalized, at);
  });

  const has = (...candidates: readonly string[]) =>
    candidates.some((candidate) => index.has(key(candidate)));

  const missing = required.filter((candidates) => !has(...candidates));
  if (missing.length > 0) {
    throw new Error(
      `${name} (${file}) has no column for ${missing.map((c) => c.join(" / ")).join(", ")}.\n` +
        `  the headers it does have: ${headers.join(", ")}\n` +
        "  db/import/README.md lists the columns each tab has to export."
    );
  }

  let errorCells = 0;
  const body = rows.slice(1).map((cells, at) => {
    const value = (...candidates: readonly string[]): string | null => {
      for (const candidate of candidates) {
        const column = index.get(key(candidate));
        if (column === undefined) continue;
        const raw = (cells[column] ?? "").trim();
        if (raw === "") return null;
        if (SPREADSHEET_ERRORS.has(raw.toLowerCase())) {
          errorCells += 1;
          return null;
        }
        return raw;
      }
      return null;
    };
    return { line: at + 2, value };
  });

  // Every cell is visited once so the count is the tab's and not the plan's: a column
  // nothing reads can still be the one that is broken, and the owner is told.
  for (const row of body) for (const header of headers) row.value(header);
  const counted = errorCells;
  errorCells = 0;

  return { name, file, headers, rows: body, errorCells: counted, has };
}
