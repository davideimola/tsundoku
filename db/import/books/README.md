# The books half

The `Biblioteca` tab, read once, **into a library that already holds the comics half**.

```sh
pnpm import:books --dry-run                                # read and translate; open no database
pnpm import:books db/import/books/fixtures/biblioteca.csv  # the rehearsal, against a committed fixture
pnpm import:books                                          # the real thing, against db/import/sheets/
pnpm import:books --prove-rollback                         # fail a check on purpose, and leave nothing
```

It is **not a migration and not a seed**, and nothing runs it for you: not `pnpm db:up`,
not `pnpm db:reset`, not the test run. Same posture as `db/import/`, for the reason that
one gives — an import that happens as a side effect of something else is an import nobody
decided to run, against a source nobody checked.

## Why there are two importers

`db/import/` reads ten tabs and **refuses a database that already holds imported data**,
because its rows are titles and shop receipts with no key to match a second run against.
That refusal is right, and it is also why it cannot be the thing that imports this: the
comics half is already in production, and `pnpm db:reset` is not an answer once the owner
has been using the library.

So this importer is the incremental one, and it has the key the other one lacks: a
**title**. It uses it in the only direction a title can be trusted in — to refuse. A run
whose titles are already in the library stops with them listed, and nothing is written.

The other difference is what a row means. The old `Biblioteca` tab could say *I read this*
and had no way at all to say *and it is on the shelf*, so the parent import writes every
books row as a Pass with no Volume. The reworked tab grew `Posseduto`, and a row now
says up to three unrelated things:

| the row says             | what lands                                                     |
| ------------------------ | -------------------------------------------------------------- |
| a title and a `Categoria`| a **Story**, always                                            |
| `Stato` names an act     | a **Pass**, through the owner's own object where there is one |
| `Posseduto`              | a **Volume**, an open **acquisition**, and the `volume_story` row |

Being read and being owned stay unrelated, which is the model's first ADR working: of the
owner's fifty-four rows, twenty-eight are Goodreads history with no object at all and nine
are objects on the shelf nobody has opened.

## What the tab has to have

Headers are matched loosely — case, accents, spacing and punctuation are ignored. The
**bold** ones are refused loudly when absent, with the headers your file actually had
printed beside them.

**Titolo**, **Categoria** (or `Tipo`), **Formato**, **Posseduto**, `Autore/i`, `ISBN`,
`Editore`, `Edizione`, `Lingua`, `Rilegatura`, `Stato`, `Voto`, `Data lettura`, `Note`,
`Fonte`.

`Rilegatura` is the column the sheet did not have and a Volume cannot do without — see
below. `Formato posseduto` is read by nothing on purpose: it says `Cartaceo`, which is a
**reading medium** and not a binding, and it is the confusion `CONTEXT.md` bans the word
`format` for.

## The choices it makes, which are not in an ADR

They are here to be overturned, not inherited quietly.

1. **An empty `Stato` is not a reading.** The parent import reads an absent state as *read
   and finished*; here an empty cell is a Story with no Pass. Every row of the owner's
   export that leaves it empty is a manual on a shelf and five of them carry no score
   either, so inventing a finished pass for them would put nine acts of reading in the
   library that never happened.
2. **`Interrotto` is a pass that has not concluded, never an abandoned one.** The owner's
   own note on those rows says "non necessariamente abbandonata", and the model has a shape
   for it: an outcome of `null`.
3. **A paper pass through an object the house holds went through that object.** A digital
   one goes through nothing — Postgres refuses it, and an ebook is deliberately not an
   object.
4. **A Rating names the Story and no Pass**, as in the parent import: `Voto` sits on a
   row, and a row is an object or a line of history — neither says which act of reading was
   being judged. The 1-5 doubles onto the owner's scale and the doubling is recorded as the
   score's grain (ADR-0008).
5. **No Rating carries prose.** Every `Note` cell on this tab is provenance chatter — where
   the row came from, that a reading stopped — and not one is a judgement of a book.
6. **An acquisition has no day and no price**, because the sheet says neither: these are
   books owned since before any of this was written down, which is the ordinary acquisition
   `CONTEXT.md` describes.
7. **A compound `Fonte` takes the Provenance of the half that testifies to the reading.**
   `Foto + Goodreads` is `goodreads-history`: a photograph proves an object is on a shelf
   and cannot say anybody read the thing. `Foto + utente` is `remembered`.
8. **No Series is created.** A Series names one Story and is a completeness ledger, and the
   seven Harry Potter books are seven Stories with seven different scores — the arrow from
   the line to the work does not exist for them. Collecting a series is a deliberate
   decision and never derived from ownership (`CONTEXT.md`), so it is not an import's to
   take.

## What it refuses, and why that is the feature

A value no vocabulary knows **stops the run with nothing written**. Widening
`db/import/vocabulary.ts` is a deliberate act; letting a word through as itself is how a
spreadsheet's vocabulary becomes the schema. Two of these earned their keep on the owner's
very first export:

- **`Romanzo/Saggistica`** is not a Type. It is two Types with a slash between them, left
  over from a column that once meant *fiction or not, roughly*, and which one a row is
  cannot be read off the cell — only off the book. Twenty-eight rows said it. The fix is in
  the sheet, one cell at a time.
- **Four rows had slipped a column**, the way a ragged row exports out of a spreadsheet.
  Nothing here looks for that damage: `Posseduto` said `Cartaceo`, a vocabulary refused a
  word, and the row number was printed. That is the same wall the other eighteen columns
  stand behind.

It also refuses two rows naming one title (which granularity a Story has is the owner's
call, case by case), a `Voto` off the sheet's own scale, and an ISBN that is neither ten
characters nor thirteen.

**A fact about a book is fixed in the sheet, never in this code.** A repair encoded here is
one export's accident carried for ever.

## Editore and Rilegatura, which the sheet did not have

A Volume needs a publisher and a binding, and **Postgres says so** rather than this
importer: `volume_publisher_is_not_blank`, and a foreign key into `binding`. The owner's
first export had the publisher on one owned row of twenty-six and a binding on none.

A row the sheet cannot describe an object from is **reported with its title and gets no
Volume**, while its Story and its reading history land as they would anyway. Filling the two
columns in and running again is then the whole of the fix — except that the second run is
refused on the titles already there, so in practice: fill them in first, and read the
`--dry-run` report before committing to anything.

Nothing here guesses a publisher. One this import invented would be a permanent fact,
silent, and wrong in a way the owner would never notice — which is the risk the Inbox exists
for, and it does not get bypassed because a spreadsheet was in a hurry.

## The row numbers in the report

`parseCsv` drops a row of nothing but empty cells — what a sheet's unused rows and the gap
between two batches export as — and rows are numbered after that. So a line number in the
report counts **rows that said something**, and after a gap it is one lower than the row
number the spreadsheet shows. Every finding names the title as well, for exactly that
reason.

## Twelve counts, asserted before committing

`expectations.ts` **cannot see the plan**, and that is the point of it: an expectation whose
number is the length of an array the write then inserts row for row is a tautology. Every
number is arithmetic over the cells the translation read and what the database already held,
both counted inside the transaction before anything is inserted — so
`story = 42 already there + 54 rows read` is a real assertion, and it fails if this import
writes a fifty-fifth Story or eats one of the forty-two that were already there.

One disagreement rolls the whole thing back. `--prove-rollback` adds a check that cannot
hold, so that can be watched happening against a real database rather than trusted.
