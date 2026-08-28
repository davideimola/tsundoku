# The fixtures

Ten tabs with the shape of the owner's two Google Sheets: the same columns, the same
Italian vocabularies, the same three confusions (`Formato` meaning two things,
`Serie / Universo` meaning three, `Acquistato` among the wish states), the same `#ERROR!`
cells, and the row counts the tracker records — Collezione 98, Wishlist 21, Master 76,
Serie e Percorsi 10, Biblioteca 54, Wishlist 3, Percorsi 2, Inbox 1 and 0.

**None of this is the owner's library.** It is fabricated data about real books, and it
exists so the import can be run, read and argued with before the real export is anywhere
near it — and so it stays runnable afterwards, which is what `pnpm import:sheets
db/import/fixtures` is for. The owner's own export goes in `db/import/sheets/`, which is
gitignored. See `../README.md`.
