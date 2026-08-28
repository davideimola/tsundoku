-- A Volume is catalogued; the Collection is the subset that is in the house (ADR-0007).
--
-- What this corrects. Until now a `volume` row existed only because `acquireVolume`
-- created it, so being catalogued and being owned were the same event and *every* Volume
-- the library knew was in the Collection. The shopping list built on that was
-- structurally correct and practically absurd — every row said "the Collection already
-- claims this Volume" — and the spreadsheet import could not name the twenty-one
-- wishlist objects without claiming the owner already had them.
--
-- So the three words separate:
--
--   volume       the object as catalogued: publisher, edition line, Binding, language, ISBN
--   acquisition  the explicit fact that it is in the house, and until when
--   Collection   the Volumes with an open acquisition
--
-- **An acquisition is a table rather than two columns on `volume`.** Two reasons, and the
-- second is the one that decided it:
--
--   - What the owner paid and the day it came home are facts about *an acquisition*, not
--     about the catalogued object. They move here, which is why `volume` loses three
--     columns and gains none.
--   - The fact must be *explicit and undated*. A Volume owned since before any of this
--     was written down has no purchase day, so a nullable `acquired_on` on `volume` could
--     not distinguish "in the house, day unknown" from "catalogued, never owned" — the
--     exact distinction this migration exists to make. Here the **row's existence** is the
--     fact and the day stays optional.
--
-- A Volume sold and bought again is two acquisitions of one catalogued object, which is
-- truer than the two `volume` rows it used to take, and the partial unique index below is
-- what keeps it from meaning two copies at once.

create table acquisition (
  id        uuid primary key default gen_random_uuid(),

  -- The catalogued object this is an acquisition of. Volumes are never deleted, so this
  -- reference cannot rot.
  volume_id uuid not null,

  -- The day it came into the house, and **optional**: a Volume owned since before any of
  -- this was written down has no receipt, and refusing to record the shelf because the day
  -- is gone would make the Collection less true rather than more. The row is the fact; the
  -- day is only when.
  acquired_on date,

  -- The day it left, and the whole of what this table says about leaving. Null is an open
  -- acquisition, and an open acquisition is the Collection. A day is a record kept: the
  -- Readings made through the object and its Edition note are facts about the owner's past
  -- that a delete would take with them.
  released_on date,

  -- What the owner paid, in euro. It belongs to the acquisition rather than to the object:
  -- the same catalogued Volume bought twice was bought at two prices. Optional, for the
  -- reason the day is.
  price_paid  numeric(10, 2),

  created_at timestamptz not null default now(),

  -- Named rather than left to `acquisition_volume_id_fkey`, because a verb writes the prose
  -- the owner reads off the constraint that refused (`src/core/verbs/README.md`).
  constraint acquisition_volume_exists foreign key (volume_id) references volume (id),

  constraint acquisition_price_paid_is_not_negative
    check (price_paid is null or price_paid >= 0),
  -- It cannot have left before it arrived. Only checked where the owner recorded both days.
  constraint acquisition_release_follows_acquisition
    check (released_on is null or acquired_on is null or released_on >= acquired_on)
);

comment on table acquisition is
  'The explicit fact that a catalogued Volume is in the owner''s house, and until when. '
  'The Collection is the Volumes with an open acquisition (ADR-0007); a catalogued Volume '
  'with no open acquisition is known and not owned, which is what a Wish names.';

comment on column acquisition.acquired_on is
  'When it came home, where the owner knows. The row is the fact, not this day.';
comment on column acquisition.released_on is
  'Null is in the house, and the Collection. A day is an acquisition that ended.';
comment on column acquisition.price_paid is 'What was paid for *this* acquisition, in euro.';

-- One open acquisition per Volume. Two would mean the Collection claimed one object twice
-- and there would be no answer to *what did I pay for it*. Partial, so the history is
-- unbounded: the same catalogued Volume can be acquired again after an acquisition of it
-- ended, which is the real event — sold, then bought again in the same printing.
create unique index acquisition_one_open_per_volume
  on acquisition (volume_id)
  where released_on is null;

-- What the Collection is read through: "has this Volume an open acquisition", asked of
-- every row of a search.
create index acquisition_by_volume on acquisition (volume_id, released_on);

-- Every Volume the library already knew was in the house, because being catalogued was the
-- only way to be recorded at all. So each one carries over as one acquisition, keeping the
-- day, the price and the release exactly as they stood.
insert into acquisition (volume_id, acquired_on, released_on, price_paid)
select id, purchase_date, released_on, price_paid from volume;

-- And the three columns leave the object. The Collection is no longer a question asked of
-- `volume` at all, which is the whole of this migration: `released_on is null` cannot be
-- written any more, so nothing can accidentally keep reading it.
alter table volume
  drop constraint volume_release_follows_purchase,
  drop column released_on,
  drop column purchase_date,
  drop column price_paid;

comment on table volume is
  'One object as catalogued: publisher, edition line, Binding, language, ISBN — '
  'everything about the *thing* and nothing about the narrative. Being catalogued is not '
  'being owned (ADR-0007): whether it is in the house is an acquisition. There is '
  'deliberately no medium column, so an owned ebook is not a row this table can hold.';

-- The Series' completeness ledger keeps its invariant, and it costs a function.
--
-- #7 wrote it as `unique (series_id, series_number) where released_on is null` — one
-- *owned* object per position, partial exactly so that selling volume 3 and buying it
-- again stayed true. Ownership has moved to another table and no partial unique index can
-- read one, so the same rule is stated as a function and raised as the same unique
-- violation under the same name: the verb that reads the constraint name is untouched, and
-- so is the prose the owner sees.
--
-- Invariants still live in Postgres. This is the first trigger in the repo, and it is not
-- a new posture — `src/core/refusal.ts` already maps a function saying no — but it is the
-- expensive way to say something, so it is worth being clear about why: the alternative was
-- a *total* unique index, which would also have refused cataloguing two printings of one
-- position, and cataloguing what the owner does not own is the point of this migration.
create function volume_holds_one_position() returns trigger
language plpgsql as $$
declare
  subject uuid;
begin
  -- Two branches rather than one `case`, because PL/pgSQL resolves the fields of `new` in a
  -- whole expression against whichever row type fired it: `new.volume_id` written beside
  -- `new.id` fails on the `volume` trigger even where it is never reached.
  if tg_table_name = 'volume' then
    subject := new.id;
  else
    subject := new.volume_id;
  end if;

  if exists (
    select 1
      from volume mine
      join volume other
        on other.series_id = mine.series_id
       and other.series_number = mine.series_number
       and other.id <> mine.id
     where mine.id = subject
       and mine.series_id is not null
       and exists (select 1 from acquisition a
                    where a.volume_id = mine.id and a.released_on is null)
       and exists (select 1 from acquisition a
                    where a.volume_id = other.id and a.released_on is null)
  ) then
    raise exception 'that position of the Series is already in the house'
      using errcode = 'unique_violation',
            constraint = 'volume_is_one_per_number_in_a_series';
  end if;

  return null;
end;
$$;

comment on function volume_holds_one_position() is
  'One owned Volume per position per Series (ADR-0007). What #7 wrote as a partial unique '
  'index, restated across two tables now that ownership is an acquisition.';

-- Both ways in: placing an object at a position, and acquiring an object already placed.
create trigger volume_holds_one_position_when_placed
  after insert or update of series_id, series_number on volume
  for each row execute function volume_holds_one_position();

create trigger volume_holds_one_position_when_acquired
  after insert or update of released_on on acquisition
  for each row execute function volume_holds_one_position();
