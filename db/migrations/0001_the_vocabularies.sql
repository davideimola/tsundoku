-- The vocabularies, which are rows and not enums.
--
-- ADR-0006 put Type, Binding, Provenance and Credit role in tables so that meeting a new
-- one is an insert rather than a schema change and a redeploy. `0000` created those tables;
-- this fills them, and it is separate from `0000` for the same reason they are data: a
-- vocabulary grows, and each growth is its own file after this one.
--
-- Hand-written, and it will stay hand-written. `drizzle-kit generate` diffs a schema and
-- emits DDL; rows are not schema and it will never write them (ADR-0009).

insert into type (id, name, display_order) values
  ('manga',         'Manga',         1),
  ('comic',         'Comic',         2),
  ('graphic-novel', 'Graphic Novel', 3),
  ('novel',         'Novel',         4),
  ('non-fiction',   'Non-fiction',   5);

-- Six from the seed, and `stapled` — a single-issue comic, saddle-stitched, which the
-- owner's own sheet turned out to hold one of (#17). None of the other six fits it, and
-- calling it a paperback to avoid an insert would put a wrong fact in the library.
insert into binding (id, name, display_order) values
  ('tankobon',  'Tankōbon',  1),
  ('omnibus',   'Omnibus',   2),
  ('deluxe',    'Deluxe',    3),
  ('must-have', 'Must Have', 4),
  ('hardcover', 'Hardcover', 5),
  ('paperback', 'Paperback', 6),
  ('stapled',   'Spillato',  7);

insert into credit_role (id, name, display_order) values
  ('writer', 'Writer', 1),
  ('artist', 'Artist', 2);

insert into provenance (id, name, description, display_order) values
  ('remembered',
   'Remembered',
   'The owner read this and remembers it. The most reliable thing here.',
   1),
  ('typed-from-the-shelf',
   'Typed from the shelf',
   'Entered by hand while looking at the object or the sheet it was recorded in.',
   2),
  ('photo-census',
   'Photo census',
   'Read off a photograph of the shelf, so the object is certain and the detail is not.',
   3),
  ('goodreads-history',
   'Goodreads history',
   'Imported from Goodreads. The act of reading is recorded; the memory of it may not be.',
   4);

-- **There is no fifth.** `converted-from-a-coarser-scale` was a Provenance once and was
-- deleted again: ADR-0008 ruled that a Provenance says where a fact came from and nothing
-- else, and a scale conversion is how coarse a score is — its own axis, on the Rating.
-- It is named here because a seed assembled from the old migrations' inserts brings it
-- back, which is what happened while writing this file and what `rating.test.ts` caught.
