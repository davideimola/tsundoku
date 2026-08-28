-- Provenance: how a record came to be known, and therefore how far it can be trusted.
--
-- First-class rather than a note, because the recommender must weigh "Goodreads says
-- I read this in 2020" differently from "I read this and I remember it" (CONTEXT.md).
-- A Reading and a Rating each carry one, and nothing carries none: an unattributed
-- fact would be read as trustworthy by default, which is the confusion the sheets
-- already have.
--
-- Stored as data for the same reason Type is (ADR-0006): the ways the owner comes to
-- know something are the owner's, they grew once already when the photo census
-- happened, and the spreadsheet import (#14) needs to name one that nobody has
-- thought of yet. A new Provenance is an insert, not a release, and nothing in
-- TypeScript enumerates these.

create table provenance (
  -- A slug, because this is what an external assistant reads over MCP and
  -- `"goodreads-history"` is legible where `2` is not (ADR-0002).
  id            text    primary key,
  name          text    not null unique,
  -- What the owner means by it, in their own words, so that the recommender can read
  -- the reliability rather than infer it from the slug.
  description   text    not null,
  display_order integer not null unique,

  constraint provenance_id_is_a_slug check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint provenance_name_is_not_blank check (name = btrim(name) and name <> ''),
  constraint provenance_description_is_not_blank
    check (description = btrim(description) and description <> ''),
  constraint provenance_display_order_is_positive check (display_order > 0)
);

comment on table provenance is
  'How a record came to be known, and therefore how far it can be trusted. Carried by '
  'every Reading and every Rating. Stored as data so that the import can name a new '
  'one without a release.';

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
   4),
  -- ADR-0001 makes this a Provenance rather than a flag of its own: 'a score converted
  -- from the coarser scale carries its Provenance so the recommender can weigh it
  -- accordingly'. The books sheet scored 1-5; those double onto this scale on import
  -- (#14) and say so here, in one place rather than two.
  ('converted-from-a-coarser-scale',
   'Converted from a coarser scale',
   'A score the owner gave out of 5, doubled onto this scale. The judgement is theirs; the precision is not.',
   5);
