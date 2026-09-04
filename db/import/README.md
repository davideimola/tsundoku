# The import

The two Google Sheets, read once, deliberately.

> **The books half has moved.** This importer refuses a database that already holds
> imported data, and once the comics half is in production that refusal covers the books
> too — so the reworked `Biblioteca` tab, the one with `Posseduto` on it, is read by
> `db/import/books/` instead. It is the incremental one: it matches on a title, refuses a
> run whose titles are already there, and writes the Volume the old tab had no column for.
> Everything below still describes this import, and `biblioteca-biblioteca.csv` is still
> one of its ten tabs on a database with nothing in it.

```sh
pnpm import:sheets db/import/fixtures    # the rehearsal, against committed fixtures
pnpm import:sheets                       # the real thing, against db/import/sheets/
pnpm import:sheets --dry-run             # read and translate; open no database
pnpm import:sheets --prove-rollback      # fail a check on purpose, and leave nothing
```

It is **not a migration and not a seed**, and nothing runs it for you: not `pnpm db:up`,
not `pnpm db:reset`, not the test run. This is the posture `bindex` wrote down as its
ADR-0009, for the reason it gave — an import that happens as a side effect of something
else is an import nobody decided to run, against a source nobody checked.

Three things it guarantees, and they are the point of it:

- **One transaction.** Everything lands or nothing does.
- **It checks its own work before committing.** Twenty-two counts, each one arithmetic over
  the source tabs' own row counts and the cells the translation read — never over the arrays
  it is about to insert, which could not fail. Every fold is counted as it folds, so
  `Stories = Collezione 98 + Biblioteca 54 - 68 titles a later row repeated` is an assertion
  and not a restatement. One disagreement rolls the whole thing back and prints which tab to
  go and look at. `db/import/expectations.ts` is deliberately unable to see the plan.
- **It refuses a database that already holds imported data.** There is no key in these
  sheets to match a second run against — a row is a title and a receipt — so a second run
  would leave two of everything with nothing to tell them apart. Re-running means
  `pnpm db:reset` and then this.

## What the owner has to do

**Export ten tabs as CSV into `db/import/sheets/`.** That directory is gitignored: it is
your reading history and your receipts, and it is read once rather than committed.

From `Collezione Fumetti e Manga`:

| tab               | file                                | rows |
| ----------------- | ----------------------------------- | ---- |
| Collezione        | `collezione-collezione.csv`         | 98   |
| Wishlist          | `collezione-wishlist.csv`           | 21   |
| Master            | `collezione-master.csv`             | 76   |
| Serie e Percorsi  | `collezione-serie-e-percorsi.csv`   | 10   |
| Liste             | `collezione-liste.csv`              | —    |
| Inbox             | `collezione-inbox.csv`              | 1    |

From `Biblioteca e Letture`:

| tab        | file                          | rows |
| ---------- | ----------------------------- | ---- |
| Biblioteca | `biblioteca-biblioteca.csv`   | 54   |
| Wishlist   | `biblioteca-wishlist.csv`     | 3    |
| Percorsi   | `biblioteca-percorsi.csv`     | 2    |
| Inbox      | `biblioteca-inbox.csv`        | 0    |

**Neither `Dashboard` is exported.** Those tiles are derived and three of them say
`#ERROR!`; a derivation is a query here rather than a stored column, so importing the last
value a broken formula produced would be importing the bug. `Master` and the two `Inbox`
tabs are optional files — they import nothing, and they are read only to be counted and
checked (see below).

Then, on a database with the schema and nothing else:

```sh
pnpm db:reset
pnpm import:sheets
```

### The columns each tab has to have

Headers are matched loosely — case, accents, spacing and punctuation are ignored, and
several spellings are accepted for most columns — but a column the import cannot work
without is refused loudly, with the headers your file actually had printed beside it. The
**bold** ones are required.

- `Collezione`: **Titolo**, **Tipo**, **Editore**, **Formato**, `Serie / Universo`,
  `Numero`, `Edizione`, `Lingua`, `ISBN`, `Prezzo`, `Data acquisto`, `Stato lettura`,
  `Voto`, `Commento`, `Note edizione`, `Sceneggiatura`, `Disegni`, `Provenienza`
- `Wishlist` (comics): **Titolo**, **Editore**, **Formato**, **Stato**, `Serie / Universo`,
  `Numero`, `Edizione`, `Lingua`, `Priorità`, `Prezzo obiettivo`, `Prezzo trovato`,
  `Negozio`, `Data acquisto`
- `Serie e Percorsi`: **Serie / Universo**, `Editore`, `Edizione`, `Volumi usciti`,
  `Stato`, `In raccolta`, `Percorso`, `Intento`, `Vincoli`
- `Biblioteca`: **Titolo**, **Tipo**, **Formato**, **Stato**, `Autore`, `Data inizio`,
  `Data fine`, `Voto`, `Note`, `Provenienza`
- `Wishlist` (books): **Titolo**, **Formato**, **Editore** — a Volume is nothing without its
  publisher — `Autore`, `Collana`, `Lingua`, `Priorità`, `Prezzo obiettivo`,
  `Prezzo trovato`, `Negozio`
- `Percorsi`: **Percorso**, `Intento`, `Titoli` (the stops, separated by `;`), `Vincoli`
- `Liste`: one column per vocabulary — `Tipo`, `Formato`, `Stato lettura`,
  `Stato wishlist`, `Lingua`, `Provenienza`
- `Master`: **Titolo** and whatever else; it imports nothing
- `Inbox`: anything; it imports nothing

If your export disagrees with this list, **fix the list rather than the sheet**: the tabs
are the source of truth about themselves, and `db/import/csv.ts` accepts more spellings by
adding one string. What must not happen is a column being accommodated by a **migration** —
the sheets are an address book, not a description, and they do not get to shape the schema.

### Rehearse it first

`db/import/fixtures/` is a committed set of ten tabs with the same shape, the same
vocabularies and the same `#ERROR!` cells as the real ones, and the same row counts on the
tabs the tracker gives counts for. It exists so the import can be run, read and argued with
before the owner's own data is anywhere near it, and so it stays runnable afterwards. It is
fabricated data about real books; nothing in it is the owner's library.

## The three confusions, and where each one went

**`Formato`** means a **Binding** in the comics sheet (Tankobon, Omnibus, Must Have) and a
**Medium** in the books sheet (Cartaceo, Ebook). Two tables in
`db/import/vocabulary.ts` that never meet: `bindingOf` and `mediumOf`. The word `format`
appears nowhere in this repo, which is what `CONTEXT.md` bans it for.

**`Serie / Universo`** carries three things in one cell. The parts are recognised rather
than guessed: a part naming a Series declared in `Serie e Percorsi` is the **Series**, a
part naming a Path declared on either sheet is the **Path**, and what is left over is the
**universe**. The Series becomes a Series, the Path becomes a Path, and the universe is
printed with a row count and **dropped** — there is no universe in the model, and an import
is not where that decision gets taken.

**`Acquistato`** is not a state of wanting. It is read as two facts the model already has
words for: the object is **in the house** (an open acquisition) and the intention that led
there is **over** (a Wish with a closing day). A Wish has no state column for it to survive
in — it is open until a deliberate act closes it, and reading this row is that act.

## What it will not do, and tells you instead

- **Place a wanted Volume in a Series.** Placing a Volume in a Series asks that the house
  hold it (ADR-0007), and that rule was deliberately left standing. Every wishlist row
  naming a Series position is reported with its row number, and the position is not written.
  The ledger loses nothing: a position with no owned object in it is missing either way.
  Whether the ledger should let a wanted object be pinned to a position is a decision
  nobody has taken, and #14 is the ticket that would have reopened it.
- **Import a wanted ebook.** A Wish names a Volume and digital ownership is deliberately
  not modelled, so there is nothing for the Wish to name. An ebook becomes a Pass with a
  digital medium, when it is read.
- **Invent a Series or a Path from a cell.** Both are deliberate declarations. A name typed
  on a row and declared nowhere is reported, and the object is catalogued outside any ledger.
- **Guess at a vocabulary.** A value no table knows **stops the import** with nothing
  written. Widening `db/import/vocabulary.ts` is a deliberate act; silently letting a
  spreadsheet's word through is how a spreadsheet's vocabulary becomes the schema. The one
  exception is the `Liste` tab: a validation value the owner has never picked is reported
  and does not stop anything, because no row depends on it.

## The choices this import makes, which are not in an ADR

They are here to be overturned, not to be inherited quietly.

1. **The same title is the same Story.** Granularity is the owner's choice case by case, and
   this is the only choice an import can make on their behalf. Twenty rows saying
   `Slam Dunk` become one Story carrying twenty objects; the collapse count is in the
   report. The reverse case — one volume holding three stories, as *L'uomo che ride* does —
   is **not in the sheets at all**, which is one of the complaints that started this
   project. It is post-import work through `recordVolumeCarriesStory`.
2. **A Rating names the Story and no Pass.** `Voto` sits on a row, and a row is an object
   or a line of history: neither says which pass was being judged. Both of
   ADR-0008's axes are still stated — Provenance for where it came from, scale for the grain.
3. **A `Stato lettura` that says the volume was read becomes a paper Pass through that
   volume**, and one that says it was not becomes no Pass at all. The state column does
   not survive as a field: a Story's state is derived from its Passes.
4. **A Wish that ended closes on the day the object came home**, or on the day of the
   import when the sheet does not say. The sheets never recorded when a wish opened, so an
   ended Wish opens and closes on the same day.
5. **`In raccolta` is the collecting decision**, and it starts on the day of the import
   unless the sheet names one. Collecting a Series is never derived from ownership, so the
   column is read as the decision itself.
6. **An empty `Lingua` is Italian.** It is a library kept in Italy and the owner leaves the
   cell empty on every Italian row.
7. **A `Numero` on a row whose Series was never declared is dropped** with the Series name,
   because a position is a position *in* something.

## Why this writes SQL and does not call the verbs

`bindex` imports by calling its verbs, and it can: there they are SQL functions, so calling
one inside a transaction is a `select`. Here the verbs are TypeScript over a pool and **one
verb is one transaction** by design, so an import made of verb calls would be two hundred
transactions and could not roll back. The criterion that the whole thing lands or nothing
does is not negotiable, so the import writes SQL.

It costs less than it looks like, because **invariants live in Postgres** here. Every rule
the verbs lean on refuses these inserts too: the score in half points, one open acquisition
per Volume, one open Wish per Volume, a digital Pass through no Volume, the trigger that
keeps one owned object per position of a Series. What is *not* free is the handful of rules
that live in TypeScript above them, and exactly one of those matters here —
`placeVolumeInSeries` refuses a Volume the house does not hold. The import honours it by
construction and then asserts it as a count that must be zero, so the same check closes the
back door and the front one.
