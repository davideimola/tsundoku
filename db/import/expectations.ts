// The counts the database has to agree with before the transaction may commit.
//
// This file exists so that **nothing here can see the plan**. An expectation whose number
// came from the length of an array that `write.ts` then inserts row for row is a tautology
// — it cannot fail, and a run full of green tautologies reads exactly like a run that
// checked something. So every number below is arithmetic over two things and nothing else:
//
//   counts   how many rows each tab of the export had
//   tally    how many cells the translation read, and how many it deliberately collapsed
//
// Both are counted **while the tabs are being read**, one increment per cell, before any
// entity exists. A miscount and a mis-insert are then two different mistakes, and it takes
// both of them agreeing for a check to pass wrongly.
//
// Every collapse is its own tally rather than a subtraction someone worked out: twenty rows
// saying `Slam Dunk` become one Story, and the nineteen that folded are counted as they
// fold. That is what lets `Stories = Collezione 98 + Biblioteca 54 - 68 folded` be a real
// assertion instead of a restatement.

/** A count the database has to agree with, and where the number came from. */
export type Expectation = {
  readonly what: string;
  readonly sql: string;
  readonly expected: number;
  readonly from: string;
};

/**
 * What the translation counts as it reads.
 *
 * Named rather than typed as string literals at the call sites, so that a tally written in
 * one place and read in another cannot drift apart silently — which is the one way this
 * arithmetic could quietly become a tautology again.
 */
export const TALLY = {
  readOnTheShelf: "Collezione rows saying the volume was read",
  ratedOnTheShelf: "Collezione rows with a Voto",
  ratedAgainOnTheShelf: "Collezione Voto cells landing on a Story already scored",
  placedFromTheShelf: "Collezione rows given a position in a Series",
  storyOnAnObject: "Collezione rows putting a Story on an object",
  editionNoteCells: "Note edizione cells",
  readInTheBooks: "Biblioteca rows saying the book was read",
  ratedInTheBooks: "Biblioteca rows with a Voto",
  ratedAgainInTheBooks: "Biblioteca Voto cells landing on a Story already scored",
  fromGoodreads: "Biblioteca rows whose Provenance is Goodreads",
  titleSaidAgain: "rows naming a title another row already named",
  creditCells: "names read out of a Sceneggiatura, Disegni or Autore cell",
  creditSaidAgain: "names repeating a person's role on one Story",
  seriesRows: "Serie e Percorsi rows naming a Series",
  seriesSaidAgain: "Series named twice in Serie e Percorsi",
  pathCells: "cells naming a Path on the two Paths tabs",
  pathSaidAgain: "Paths named twice across the two Paths tabs",
  constraintCells: "Vincoli cells",
  constraintSaidAgain: "Vincoli cells repeating a sentence already declared",
  stopClaims: "claims that a Story is a stop on a Path",
  stopSaidAgain: "stop claims repeating a stop already placed",
  stopUnresolved: "stop claims naming a title neither sheet has",
  acquistato: "wishlist rows saying Acquistato",
  wishEnded: "wishlist rows whose intention is over",
  placedFromTheWishlist: "Acquistato rows given a position in a Series",
  unplacedWish: "wishlist rows naming a Series position the house does not hold",
  wantedAsAFile: "books-wishlist rows wanting a file",
} as const;

export type Tally = ReadonlyMap<string, number>;
export type Counts = ReadonlyMap<string, number>;

/** The whole check list, from the row counts and the tally alone. */
export function expectationsOf(counts: Counts, tally: Tally): readonly Expectation[] {
  const rows = (tab: string) => counts.get(tab) ?? 0;
  const read = (name: string) => tally.get(name) ?? 0;

  const collezione = rows("Collezione");
  const comicsWishlist = rows("Wishlist (Collezione)");
  const biblioteca = rows("Biblioteca");
  const booksWishlist = rows("Wishlist (Biblioteca)");
  const seriesAndPaths = rows("Serie e Percorsi");
  const booksPaths = rows("Percorsi");

  const wantedBooks = booksWishlist - read(TALLY.wantedAsAFile);
  const acquistato = read(TALLY.acquistato);
  const ended = read(TALLY.wishEnded);
  const ratedTwice = read(TALLY.ratedAgainOnTheShelf) + read(TALLY.ratedAgainInTheBooks);

  return [
    {
      what: "catalogued Volumes",
      sql: "select count(*) from volume",
      expected: collezione + comicsWishlist + wantedBooks,
      from:
        `Collezione ${collezione} + Wishlist (Collezione) ${comicsWishlist} + ` +
        `Wishlist (Biblioteca) ${booksWishlist} - ${read(TALLY.wantedAsAFile)} wanting a file`,
    },
    {
      what: "Volumes in the Collection (an open acquisition)",
      sql: "select count(*) from acquisition where released_on is null",
      expected: collezione + acquistato,
      from: `Collezione ${collezione} + ${acquistato} wishlist row(s) saying Acquistato`,
    },
    {
      what: "Volumes catalogued and never in the house",
      sql:
        "select count(*) from volume v where not exists " +
        "(select 1 from acquisition a where a.volume_id = v.id)",
      expected: comicsWishlist - acquistato + wantedBooks,
      from:
        `Wishlist (Collezione) ${comicsWishlist} - ${acquistato} Acquistato + ` +
        `${wantedBooks} wanted book(s) — ADR-0007's whole point`,
    },
    {
      what: "open Wishes",
      sql: "select count(*) from wish where closed_on is null",
      expected: comicsWishlist - ended + wantedBooks,
      from:
        `Wishlist (Collezione) ${comicsWishlist} - ${ended} whose intention is over + ` +
        `${wantedBooks} wanted book(s)`,
    },
    {
      what: "Wishes that ended",
      sql: "select count(*) from wish where closed_on is not null",
      expected: ended,
      from:
        `${acquistato} row(s) saying Acquistato — a Wish that ended and not a wish state — ` +
        `and ${ended - acquistato} given up on`,
    },
    {
      what: "Stories",
      sql: "select count(*) from story",
      expected: collezione + biblioteca - read(TALLY.titleSaidAgain),
      from:
        `Collezione ${collezione} + Biblioteca ${biblioteca} - ` +
        `${read(TALLY.titleSaidAgain)} row(s) naming a title another row already named`,
    },
    {
      what: "Passes",
      sql: "select count(*) from pass",
      expected: read(TALLY.readOnTheShelf) + read(TALLY.readInTheBooks),
      from:
        `${read(TALLY.readOnTheShelf)} Collezione row(s) that say they were read + ` +
        `${read(TALLY.readInTheBooks)} Biblioteca row(s) that do`,
    },
    {
      what: "Passes through no Volume",
      sql: "select count(*) from pass where volume_id is null",
      expected: read(TALLY.readInTheBooks),
      from:
        `every Biblioteca row that was read: ${read(TALLY.readInTheBooks)} — a book read is ` +
        "a Pass, and the shelf is another question",
    },
    {
      what: "Goodreads Passes passing through a Volume",
      sql:
        "select count(*) from pass " +
        "where provenance_id = 'goodreads-history' and volume_id is not null",
      expected: 0,
      from:
        `the ${read(TALLY.fromGoodreads)} Goodreads row(s) land as a Story and a Pass, ` +
        "with no Volume",
    },
    {
      what: "Ratings",
      sql: "select count(*) from rating",
      expected: read(TALLY.ratedOnTheShelf) + read(TALLY.ratedInTheBooks) - ratedTwice,
      from:
        `${read(TALLY.ratedOnTheShelf)} Collezione + ${read(TALLY.ratedInTheBooks)} ` +
        `Biblioteca row(s) with a Voto - ${ratedTwice} landing on a Story already scored`,
    },
    {
      what: "Ratings given in half points",
      sql: "select count(*) from rating where scale = 'half-points'",
      expected: read(TALLY.ratedOnTheShelf) - read(TALLY.ratedAgainOnTheShelf),
      from:
        `the Collezione Voto column, already the owner's own 1-10: ` +
        `${read(TALLY.ratedOnTheShelf)} - ${read(TALLY.ratedAgainOnTheShelf)} repeated`,
    },
    {
      what: "Ratings doubled off a 1-5 column, and marked coarse",
      sql: "select count(*) from rating where scale = 'coarse'",
      expected: read(TALLY.ratedInTheBooks) - read(TALLY.ratedAgainInTheBooks),
      from:
        `the Biblioteca Voto column: ${read(TALLY.ratedInTheBooks)} score(s) out of 5, ` +
        `doubled (ADR-0008), - ${read(TALLY.ratedAgainInTheBooks)} repeated`,
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
      expected: read(TALLY.seriesRows) - read(TALLY.seriesSaidAgain),
      from:
        `${read(TALLY.seriesRows)} of Serie e Percorsi's ${seriesAndPaths} rows name a ` +
        `Series, ${read(TALLY.seriesSaidAgain)} of them one already named`,
    },
    {
      what: "Paths",
      sql: "select count(*) from path",
      expected: read(TALLY.pathCells) - read(TALLY.pathSaidAgain),
      from:
        `${read(TALLY.pathCells)} cell(s) name a Path across Serie e Percorsi ` +
        `(${seriesAndPaths} rows) and Percorsi (${booksPaths}), ` +
        `${read(TALLY.pathSaidAgain)} of them one already named`,
    },
    {
      what: "Volumes given a position in a Series",
      sql: "select count(*) from volume where series_id is not null",
      expected: read(TALLY.placedFromTheShelf) + read(TALLY.placedFromTheWishlist),
      from:
        `${read(TALLY.placedFromTheShelf)} Collezione + ` +
        `${read(TALLY.placedFromTheWishlist)} Acquistato row(s), and ` +
        `${read(TALLY.unplacedWish)} wanted position(s) reported and not written: placing a ` +
        "Volume in a Series asks that the house hold it (ADR-0007)",
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
      expected: read(TALLY.storyOnAnObject),
      from: `one per Collezione row: ${collezione}, over the Stories they fold into`,
    },
    {
      what: "Credits",
      sql: "select count(*) from credit",
      expected: read(TALLY.creditCells) - read(TALLY.creditSaidAgain),
      from:
        `${read(TALLY.creditCells)} name(s) in a Sceneggiatura, Disegni or Autore cell - ` +
        `${read(TALLY.creditSaidAgain)} repeating a role that person already has on that Story`,
    },
    {
      what: "Path stops",
      sql: "select count(*) from path_item",
      expected: read(TALLY.stopClaims) - read(TALLY.stopSaidAgain) - read(TALLY.stopUnresolved),
      from:
        `${read(TALLY.stopClaims)} claim(s) from the Path part of Serie / Universo and the ` +
        `ordered titles on Percorsi - ${read(TALLY.stopSaidAgain)} repeated - ` +
        `${read(TALLY.stopUnresolved)} naming a title neither sheet has`,
    },
    {
      what: "Edition notes",
      sql: "select count(*) from edition_note",
      expected: read(TALLY.editionNoteCells),
      from:
        `${read(TALLY.editionNoteCells)} Note edizione cell(s) of Collezione: what the owner ` +
        "thinks of the object",
    },
    {
      what: "declared constraints",
      sql: "select count(*) from declared_constraint",
      expected: read(TALLY.constraintCells) - read(TALLY.constraintSaidAgain),
      from:
        `${read(TALLY.constraintCells)} Vincoli cell(s) on the two Paths tabs, in the owner's ` +
        `own words, - ${read(TALLY.constraintSaidAgain)} saying one twice`,
    },
  ];
}
