-- Series: a publisher's ordered sequence of Volumes for one edition, and a **completeness
-- ledger rather than a narrative concept**.
--
-- It answers *"what am I missing"* and never *"was it any good"*, and the shape of this
-- table is that sentence made structural:
--
-- - **There is no story column here, and there never will be.** A Series cannot claim a
--   narrative, which is why one Story running in several Series — *Fullmetal Alchemist*
--   standard and Ultimate Deluxe, *Death Note* in six Black Edition volumes or twelve
--   standard ones — is the ordinary case rather than a special one: the two Series are
--   two rows that know nothing of each other, each with its own published count. What
--   ties a Series to a narrative is which Stories its Volumes carry, which is the Story
--   ↔ Volume join and belongs to no table here (ADR-0001).
-- - **There is no rating and no note.** Judgement of the narrative is a Rating on the
--   Story; judgement of the object is an Edition note on the Volume. A Series is neither.
-- - **Collecting is a column the owner writes deliberately.** Holding 42 of Naruto's 72
--   volumes opens no collecting project, so ownership can never imply it: nothing but
--   `declareSeriesCollected` sets `collecting_since`, and a Series with it null is a
--   Series the owner knows about and is not completing.
--
-- And what is *not* here: the missing Volumes. Derivations are queries rather than
-- stored columns, and this one is the argument for that rule — the four Death Note Black
-- Edition rows the owner types by hand today are `generate_series` against the shelf.
-- See `src/core/queries/series.ts`.

create table series (
  -- A generated id rather than a slug: a Series's natural name is its title, and titles
  -- repeat across publishers and across editions. Type, Binding and Provenance are
  -- slugs because their rows are a vocabulary; these rows are things in the world.
  id              uuid primary key default gen_random_uuid(),

  -- The Series' name, without its edition. `Death Note`, not `Death Note Black Edition`:
  -- the edition is the column below, and keeping them apart is what lets the two Death
  -- Note Series be told apart by the thing that actually differs.
  name            text not null,

  publisher       text not null,

  -- The publisher's edition — `Black Edition`, `Ultimate Deluxe Edition`. Optional, because
  -- most series are simply the standard printing and inventing a name for that would be
  -- worse than leaving it empty. Same meaning, same optionality, as on `volume`.
  edition_line    text,

  -- How many Volumes have been published. The left-hand side of the whole ledger, and
  -- the owner's knowledge rather than a fact this app can check: an ongoing Series' count
  -- grows, which is why `recordVolumesPublished` exists.
  --
  -- Zero is allowed and means an announced Series with nothing out yet, which is a real
  -- thing to be waiting for.
  published_count integer not null,

  -- Whether the publisher is still adding to the Series. It changes what *missing* means:
  -- everything is missing from a concluded Series for good, while an ongoing Series is
  -- incomplete in a way that is nobody's fault yet.
  --
  -- A check rather than a table of its own, unlike Type and Provenance: these two values
  -- are not a vocabulary that can grow, they are the two states a published Series can
  -- be in, and a third would be a change to the model rather than an insert.
  status          text not null,

  -- The day the owner decided they are completing this Series, and **null for every Series
  -- they have not**. This column is the Naruto case: it is written by one verb and
  -- derived from nothing, so no amount of buying can open a project the owner never
  -- started, and no query has to guess at their intention.
  collecting_since date,

  created_at      timestamptz not null default now(),

  -- Invariants live in Postgres: the database refuses what must never be true rather
  -- than trusting the application to remember.
  constraint series_name_is_not_blank check (name = btrim(name) and name <> ''),
  constraint series_publisher_is_not_blank check (publisher = btrim(publisher) and publisher <> ''),
  constraint series_edition_line_is_not_blank
    check (edition_line is null or (edition_line = btrim(edition_line) and edition_line <> '')),
  constraint series_published_count_is_not_negative check (published_count >= 0),
  constraint series_status_is_ongoing_or_concluded check (status in ('ongoing', 'concluded')),

  -- One row per Series, and `nulls not distinct` is what makes that one rule instead of
  -- two: without it the standard printing — which carries no edition line — would escape
  -- the constraint and could be declared twice, which is exactly the Series most likely to
  -- be declared twice.
  constraint series_is_one_per_edition_line
    unique nulls not distinct (name, publisher, edition_line)
);

comment on table series is
  'A publisher''s ordered sequence of Volumes for one edition, held as a completeness '
  'ledger: how many Volumes are out, whether the Series is ongoing, and whether the owner '
  'decided to complete it. What is missing is derived from those and the shelf, and '
  'stored nowhere.';

comment on column series.name is 'The Series name without its edition: Death Note.';
comment on column series.edition_line is 'The publisher''s edition, not the Series itself.';
comment on column series.published_count is 'How many Volumes are out. The owner''s knowledge, and it grows.';
comment on column series.status is 'ongoing or concluded.';
comment on column series.collecting_since is
  'The day the owner decided to complete this Series. Null is a Series they are not '
  'collecting, and owning Volumes of it never fills this in.';

-- A Volume's position within a Series is an addition to the Volume rather than a table of
-- its own, because it is a fact about the object: `Slam Dunk 12` *is* the twelfth thing in
-- that Series, the way its ISBN is its ISBN. Most Volumes belong to no Series at all — a
-- standalone graphic novel, a novel — and those two columns are simply null for them.
--
-- The reading axis is untouched by this. Which Stories a Volume carries stays a
-- many-to-many join of its own (ADR-0001), and a Series learns nothing about narrative by
-- gaining Volumes.
alter table volume
  add column series_id     uuid,
  add column series_number integer,

  -- Named rather than left to `volume_series_id_fkey`, because a verb writes the prose the
  -- owner reads off the constraint that refused (`src/core/verbs/README.md`).
  add constraint volume_series_exists foreign key (series_id) references series (id),

  -- Either both or neither. A Volume in a Series without a position would be invisible to
  -- the derivation and would make the ledger quietly wrong — the shelf would hold it and
  -- the missing list would still ask for it — and a position without a Series means nothing
  -- at all.
  add constraint volume_in_a_series_has_a_number check ((series_id is null) = (series_number is null)),
  add constraint volume_series_number_is_positive check (series_number is null or series_number > 0);

comment on column volume.series_id is 'The Series this object belongs to, where it belongs to one.';
comment on column volume.series_number is 'Its position in that Series: 12 of Slam Dunk.';

-- One owned object per position per Series. This is the constraint the derivation trusts:
-- with it, "how many Volumes of the Series are in the house" is a count and cannot double-count a
-- volume recorded twice by mistake.
--
-- Partial rather than total, and `released_on is null` is the reason: the owner can sell
-- volume 3 and buy it again in a better printing, and both rows are true — the released
-- one is a fact about their past (Readings were made through it), the current one is what
-- the Collection claims. What is refused is holding two of the same number at once.
create unique index volume_is_one_per_number_in_a_series
  on volume (series_id, series_number)
  where released_on is null;
