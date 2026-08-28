-- Story to Volume: the many-to-many the spreadsheets could not hold.
--
-- This is ADR-0001 made structural. Two cases in the owner's own collection break the
-- shape every tool in this space has — the rating hanging off the object you bought:
-- *L'uomo che ride* is **one Volume holding three Stories** he reviewed separately, and
-- *Slam Dunk* is **one Story across twenty Volumes** he would never rate one by one. A
-- column on either table can hold one of those and not the other, which is why this is a
-- table of its own and not a column anywhere.
--
-- **The fact is stored, and neither direction is derived from the other.** One row says
-- "this Volume carries this Story". Read from the Volume it answers "which Stories does
-- this object hold"; read from the Story it answers "which objects carry it". There is no
-- primary side, no owner and nothing to keep in step, because there is only one fact.
--
-- What is deliberately **not** here:
--
--   - No order of the Stories within the Volume. *L'uomo che ride* holds three and the
--     owner has never needed to say which comes first; a position nobody reads would be
--     a column two slices from now would have to keep true.
--   - No position of the Volume within the line. That is a Series' question — how many
--     were published, which one comes next — and it belongs to the Series slice, which
--     hangs it off `volume` and not off this table.
--   - No Rating. The judgement is of the Story and there is no column here it could
--     reach; what the owner thinks of the object is an Edition note, in its own file.

create table volume_story (
  -- Named for both sides, because neither owns the other: `CONTEXT.md` refuses both "the
  -- volume's story" and "the story's volume", and this table is why it can.
  volume_id  uuid        not null,
  story_id   uuid        not null,
  created_at timestamptz not null default now(),

  -- One fact, once. Saying it twice is the same fact, which is what makes recording it
  -- safe to repeat and a duplicate worth refusing rather than stacking.
  constraint volume_story_is_said_once primary key (volume_id, story_id),

  -- Named rather than left to `volume_story_volume_id_fkey`, because a verb writes the
  -- prose the owner reads off the constraint that refused
  -- (`src/core/verbs/README.md`) and a generated name is a worse thing to match on.
  constraint volume_story_volume_exists
    foreign key (volume_id) references volume (id) on delete cascade,
  constraint volume_story_story_exists
    foreign key (story_id) references story (id) on delete cascade
);

comment on table volume_story is
  'Which Stories a Volume carries: many-to-many in both directions (ADR-0001). One '
  'Volume holds several Stories and one Story spans several Volumes, and neither side '
  'is derived from the other — the link is stored.';

-- The primary key already serves the Volume direction, leading on `volume_id`. This is
-- the other one: from a Story, which Volumes carry it. Both directions are asked on
-- every screen this slice touches, so both are indexed rather than one.
create index volume_story_by_story on volume_story (story_id);

-- The Volume a Reading went through, where there was one.
--
-- The Reading slice left this column out rather than adding one that referred to a table
-- nothing had built yet, and it belongs here: it is the third fact this join makes
-- expressible. Nullable, and null is ordinary rather than incomplete — a Story read
-- digitally, borrowed or known only from Goodreads history has no object to point at
-- (ADR-0001).
alter table reading add column volume_id uuid;

comment on column reading.volume_id is
  'The object the reading went through, where there was one. Null is the ordinary case: '
  'being read and being owned are unrelated facts.';

alter table reading
  -- `set null` rather than `cascade`: a Volume's row is kept when it leaves the house, so
  -- this only fires if one is genuinely deleted, and then the act of reading is still
  -- true — only the object it went through is no longer known.
  add constraint reading_volume_exists
    foreign key (volume_id) references volume (id) on delete set null,

  -- Digital ownership is not modelled, so a Volume is a paper object and reading
  -- digitally goes through none: "an ebook is a Reading with a digital medium and no
  -- Volume" (`CONTEXT.md`). The owner holding the paper Volume too is not this Reading.
  add constraint reading_digital_went_through_no_volume
    check (volume_id is null or medium = 'paper');

-- Nothing here says the Volume a Reading went through must be one that carries the
-- Story. It usually is, and requiring it would refuse a true reading because a link
-- nobody has typed yet is missing — the sheets are full of exactly that. The join is
-- the owner's record of what an object holds, not a permission for having read it.
