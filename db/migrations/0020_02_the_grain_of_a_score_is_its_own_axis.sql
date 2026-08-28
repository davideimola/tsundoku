-- Provenance is origin only; the grain of a score is its own axis (ADR-0008).
--
-- What this corrects. `converted-from-a-coarser-scale` was seeded as a **Provenance**, on
-- ADR-0001's word that a converted score "carries its Provenance". That collapses two
-- questions into one row: a score doubled from the books sheet's 1-5 could say it was
-- coarse *or* say where it came from, never both, so coarse-and-from-Goodreads and
-- coarse-and-from-the-sheet were the same value. The spreadsheet import reads exactly
-- those scores, and it needs to say both things.
--
-- So the two axes separate, and only on a Rating:
--
--   rating.provenance_id  how it came to be known — goodreads-history, the sheet, remembered
--   rating.scale          the grain the owner gave it in — coarse, half-points
--
-- **A Reading's Provenance is untouched.** Grain is a property of a score and an act of
-- reading has none, so nothing about `reading` changes here.
--
-- **A check constraint rather than a data row**, and #8 argued this case already: Type,
-- Binding, Provenance and credit_role are *vocabularies*, and a vocabulary that grows is
-- stored as data so a seventh value is an insert. These two are not a vocabulary. They are
-- the model's own shape, the way a Reading's medium is paper or digital: the owner's scale
-- is 1 to 10 in half points, coarse names a score that was given out of 5 and doubled, and
-- a third grain would be a change to the model rather than an insert.

alter table rating
  -- Default only for the length of this migration: every score already here was given in
  -- the scale the model uses, except the ones the update below finds.
  add column scale text not null default 'half-points';

-- The converted scores keep their grain and gain an origin. `typed-from-the-shelf` is the
-- honest one for them — "entered by hand while looking at the object or the sheet it was
-- recorded in" is where a 1-5 score came from — and it is now sayable beside the grain
-- instead of instead of it.
update rating
   set scale = 'coarse',
       provenance_id = 'typed-from-the-shelf'
 where provenance_id = 'converted-from-a-coarser-scale';

-- And the Provenance value goes. It is not a way a record came to be known, and leaving it
-- there would leave two places to say one thing.
delete from provenance where id = 'converted-from-a-coarser-scale';

alter table rating
  -- No default from here on: the grain of a score is something the caller says, the way a
  -- Reading's medium is. A verb may choose a sensible one for the owner; the column does
  -- not choose for it.
  alter column scale drop default,
  add constraint rating_scale_is_coarse_or_half_points
    check (scale in ('coarse', 'half-points'));

comment on column rating.scale is
  'The grain the owner gave this score in: half-points on the model''s 1-10 scale, or '
  'coarse for one given out of 5 and doubled onto it. Not a Provenance (ADR-0008).';

comment on table rating is
  'The owner''s judgement of a Story: 1 to 10 in half points, with prose where they wrote '
  'some, the grain it was given in, and where it came from — two separate axes '
  '(ADR-0008). It never attaches to a Volume (ADR-0001), and this table has no column '
  'with which it could.';

comment on table provenance is
  'How a record came to be known, and therefore how far it can be trusted. Origin only: '
  'the grain of a score is `rating.scale` (ADR-0008). Carried by every Reading and every '
  'Rating, and stored as data so that the import can name a new one without a release.';
