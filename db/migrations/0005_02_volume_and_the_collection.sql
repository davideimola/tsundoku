-- Volume: one physical object the owner buys and keeps — a manga tankobon, an omnibus,
-- a novel. It carries the publisher, the edition line, the language, the price and the
-- ISBN: everything about the *thing* and nothing about the narrative (ADR-0001).
--
-- **Digital ownership is not representable, and that is structural rather than a
-- validation.** There is no medium column here, and no `is_digital` flag, so there is
-- nothing to reject: an owned ebook is not a row this table can hold, in any state. An
-- ebook is a Reading with a digital medium and no Volume, which is where the medium
-- lives and the only place it does. The owner's reason is that a file is not something
-- they collect and not something they forget they have.
--
-- The Collection is not a table. It is the Volumes physically in the owner's home, which
-- is a **question asked of this one** — `released_on is null` — and derivations are
-- queries rather than stored columns. See `src/core/queries/collection.ts`.
--
-- Nothing here reaches for the reading axis. A Volume holds no story, no rating and no
-- Type: which Stories a Volume carries is a many-to-many join of its own (ADR-0001), and
-- it needs both sides to exist first.

create table volume (
  -- A generated id rather than a slug, because a Volume's natural name is its title and
  -- titles repeat: the owner can hold the same book twice, in two editions or twice over.
  -- Type and Binding are slugs because their rows are a vocabulary; this table's rows are
  -- objects.
  id            uuid primary key default gen_random_uuid(),

  -- What is printed on the object. It is not the name of a Story: `L'uomo che ride` is
  -- one Volume title over three Stories, and `Slam Dunk 1` names one of twenty objects
  -- carrying one Story.
  title         text not null,

  publisher     text not null,

  -- The publisher's line — `Ultimate Deluxe Edition`, `Black Edition`. Optional, because
  -- most volumes are simply the standard printing and inventing a name for that would be
  -- worse than leaving it empty. Never a synonym for the volume itself.
  edition_line  text,

  binding_id    text not null references binding (id),

  -- The language of *this object*, as a code: `it`, `en`, `ja`. A code rather than prose
  -- because the Collection is read over MCP and answered against, and `Italian` /
  -- `italiano` / `ITA` in three rows is a question that cannot be asked.
  language      text not null,

  -- What the owner paid, in euro, and when. Both optional: a Volume owned since before
  -- any of this was written down has neither, and refusing to record the shelf because
  -- the receipt is gone would make the Collection less true rather than more.
  price_paid    numeric(10, 2),
  purchase_date date,

  isbn          text,

  -- The Volume left the owner's hands on this day, and the Collection stops claiming it
  -- from that moment.
  --
  -- A nullable day on the row rather than a delete or a separate table: the record of the
  -- object having existed is not destroyed — Readings made through it, and its Edition
  -- note, are facts about the owner's past that a delete would take with it — and every
  -- other slice's join to `volume` keeps working untouched.
  released_on   date,

  -- Invariants live in Postgres: the database refuses what must never be true rather
  -- than trusting the application to remember.
  constraint volume_title_is_not_blank check (title = btrim(title) and title <> ''),
  constraint volume_publisher_is_not_blank check (publisher = btrim(publisher) and publisher <> ''),
  constraint volume_edition_line_is_not_blank
    check (edition_line is null or (edition_line = btrim(edition_line) and edition_line <> '')),
  constraint volume_language_is_a_code check (language ~ '^[a-z]{2,3}(-[a-z0-9]+)*$'),
  constraint volume_price_paid_is_not_negative check (price_paid is null or price_paid >= 0),
  constraint volume_isbn_is_ten_or_thirteen_characters check (isbn is null or isbn ~ '^[0-9]{9}[0-9Xx]$|^[0-9]{13}$'),
  -- A Volume cannot leave the house before it arrived in it. Only checked where the
  -- owner recorded both days.
  constraint volume_release_follows_purchase
    check (released_on is null or purchase_date is null or released_on >= purchase_date)
);

comment on table volume is
  'One physical object the owner buys and keeps. There is deliberately no medium '
  'column: digital ownership is not modelled, so an owned ebook is not a row this '
  'table can hold. A Volume the owner no longer has keeps its row and carries a '
  'released_on day, which is what the Collection reads.';

comment on column volume.edition_line is 'The publisher''s line, not the volume itself.';
comment on column volume.language is 'A language code — it, en, ja.';
comment on column volume.released_on is
  'The day it left the house. Null is the Collection; a day is a record kept.';

-- There is deliberately no index for the Collection's search. It matches a word
-- anywhere in a title, which no b-tree can serve, and the whole Collection is a hundred
-- rows: a sequential scan over it is the right plan, and an index that looked like it
-- helped would only be a claim nobody had measured.
