// The twelve tabs, as files on disk.
//
// The import reads a **directory**, not a Google account: the owner exports each tab as
// CSV, drops the files in one place and runs the import against them. That is deliberate
// and not a shortcut. An import that fetched the sheets live would be a second thing that
// can fail at the moment it matters, would need a Google credential the local loop does
// not have, and would make the run unrepeatable — where a directory of files is a frozen
// source that can be re-run against the same bytes until the result is right, which is
// the discipline `bindex`'s ADR-0009 asked of a one-shot import.
//
// `db/import/README.md` is the export instructions, file names included.
//
// **Two tabs are deliberately not read.** Both Dashboards are derived tiles — three of
// the `Biblioteca` five say `#ERROR!` — and derivations are queries here, not stored
// columns. Importing a broken formula's last value would be importing the bug.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { readTab, type Tab } from "./csv.ts";

/** A tab that may not have been exported: the Inboxes and the Master. */
function optionalTab(
  directory: string,
  file: string,
  name: string,
  required: readonly (readonly string[])[] = []
): Tab | null {
  const path = join(directory, file);
  return existsSync(path) ? readTab(path, name, required) : null;
}

function requiredTab(
  directory: string,
  file: string,
  name: string,
  required: readonly (readonly string[])[]
): Tab {
  const path = join(directory, file);
  if (!existsSync(path)) {
    throw new Error(
      `${name} was not exported: no ${file} in ${directory}.\n` +
        "  db/import/README.md says which tab goes in which file."
    );
  }
  return readTab(path, name, required);
}

/** Everything the import reads, and the tabs it deliberately does not. */
export type Sheets = {
  readonly directory: string;
  /** `Collezione Fumetti e Manga` — the objects on the shelf, one row per Volume. */
  readonly collezione: Tab;
  /** Its `Wishlist` — objects the library knows and the house does not hold. */
  readonly comicsWishlist: Tab;
  /** Its `Serie e Percorsi` — the completeness ledger and the owner's routes. */
  readonly seriesAndPaths: Tab;
  /** Its `Liste` — the validation vocabularies the other tabs' cells came from. */
  readonly lists: Tab | null;
  /** Its `Master`, a column subset of `Collezione`: read only to be checked against it. */
  readonly master: Tab | null;
  /** `Biblioteca e Letture` — one row per book read, Goodreads history included. */
  readonly biblioteca: Tab;
  /** Its `Wishlist` — three books wanted. */
  readonly booksWishlist: Tab;
  /** Its `Percorsi` — two routes through the books. */
  readonly booksPaths: Tab;
  /** The two `Inbox` tabs, counted and never imported. */
  readonly inboxes: readonly Tab[];
};

/**
 * Read the export directory.
 *
 * The required columns are the ones the import cannot do its job without. Everything else
 * is read if it is there — the sheets grew a column at a time and an export from next year
 * will have one more.
 */
export function readSheets(directory: string): Sheets {
  const collezione = requiredTab(directory, "collezione-collezione.csv", "Collezione", [
    ["Titolo"],
    ["Tipo"],
    ["Editore"],
    ["Formato"],
  ]);

  const comicsWishlist = requiredTab(
    directory,
    "collezione-wishlist.csv",
    "Wishlist (Collezione)",
    [["Titolo"], ["Editore"], ["Formato"], ["Stato"]]
  );

  const seriesAndPaths = requiredTab(
    directory,
    "collezione-serie-e-percorsi.csv",
    "Serie e Percorsi",
    [["Serie / Universo", "Serie"]]
  );

  const biblioteca = requiredTab(directory, "biblioteca-biblioteca.csv", "Biblioteca", [
    ["Titolo"],
    ["Tipo"],
    ["Formato"],
    ["Stato"],
  ]);

  const booksWishlist = requiredTab(directory, "biblioteca-wishlist.csv", "Wishlist (Biblioteca)", [
    ["Titolo"],
    ["Formato"],
  ]);

  const booksPaths = requiredTab(directory, "biblioteca-percorsi.csv", "Percorsi", [["Percorso"]]);

  const inboxes = [
    optionalTab(directory, "collezione-inbox.csv", "Inbox (Collezione)"),
    optionalTab(directory, "biblioteca-inbox.csv", "Inbox (Biblioteca)"),
  ].filter((tab): tab is Tab => tab !== null);

  return {
    directory,
    collezione,
    comicsWishlist,
    seriesAndPaths,
    lists: optionalTab(directory, "collezione-liste.csv", "Liste"),
    master: optionalTab(directory, "collezione-master.csv", "Master", [["Titolo"]]),
    biblioteca,
    booksWishlist,
    booksPaths,
    inboxes,
  };
}

/** Every tab that was read, for the report. */
export function tabsRead(sheets: Sheets): readonly Tab[] {
  return [
    sheets.collezione,
    sheets.comicsWishlist,
    sheets.master,
    sheets.seriesAndPaths,
    sheets.lists,
    sheets.biblioteca,
    sheets.booksWishlist,
    sheets.booksPaths,
    ...sheets.inboxes,
  ].filter((tab): tab is Tab => tab !== null);
}
