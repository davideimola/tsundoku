-- The Reading list is a **query and never a table**, and this file is the whole of what it
-- stores: pins.
--
-- **There is deliberately no table of Reading list entries.** The list composes itself
-- from the next unread Story of every active Path and the next missing Volume of every
-- Series being collected (CONTEXT.md, user story 22) — both of which are already
-- derivations over rows the owner wrote for another reason — so an entry has nowhere it
-- could be stored stale. The `Prossimo` column of the spreadsheet is exactly that stored
-- copy, and recomputing it by hand is the chore this application exists to end (#1). So if
-- you are looking for `reading_list_entry`, it is not missing: it is the thing that must
-- not exist.
--
-- What the owner does keep by hand is the **order**, and only where they disagree with it.
-- A pin is that disagreement, and it is one row.
--
-- **A pin points at the source of an entry — a Path or a Series — and not at the thing to
-- read.** That is the decision in this file, and the reason is that an entry has no stable
-- row of its own: it is a *position* in a derivation, and the Story standing in it changes
-- the moment the owner finishes something. What is stable is the route or the ledger the
-- entry comes from, and the correspondence is exact: **each active Path contributes exactly
-- one entry** (its next unread Story) and **each Series being collected contributes exactly
-- one** (its next missing Volume). So a permutation of the sources *is* a permutation of the
-- Reading list, and a pin on *Angolo Giappone* keeps that route at the top while the owner works
-- through it rather than evaporating the moment they read the Story it happened to be
-- showing.
--
-- **A pin reorders and can never introduce.** It carries no Story, no Volume, no medium and
-- no prose — there is nothing in this table for an entry to be made *out of*, so a pin on a
-- Path that is put aside, or on a Series nobody is collecting, contributes nothing at all
-- and simply waits. That is what keeps the criterion true under the one thing that could
-- break it: a table of pins that could invent an entry would be a hand-kept list wearing
-- another word.
--
-- Two nullable references rather than a `(kind, id)` pair, so that the database refuses a
-- pin on a route or a ledger that does not exist, and so that deleting either takes its pin
-- with it. Exactly one of them is filled, which is the check below.

create table reading_list_pin (
  -- The route whose next stop the owner wants first. Null when this pin is on a Series.
  path_id   uuid,

  -- The Series whose next missing Volume the owner wants first. Null when it is on a Path.
  series_id uuid,

  -- **When it was pinned, and the whole of the order among pins.** The most recent pin
  -- comes first, because pinning is the act of saying *this next*: the owner pins what
  -- they have just decided about, and a pin that landed behind everything they pinned
  -- last month would say the opposite of what the tap meant.
  --
  -- A timestamp rather than the sparse `numeric` position `path_item` uses, and the
  -- difference is that there is no move to make here. A route is re-ordered stop by stop,
  -- which is why it needs a value between two neighbours; a pin is re-ordered by pinning it
  -- again, which is one write of this column and needs no arithmetic.
  pinned_at timestamptz not null default now(),

  -- A pin is on a Path or on a Series, and it is meaningless without one of them: there is
  -- no such thing as a pin on nothing, and a row with both filled would be one decision
  -- claiming two subjects.
  constraint reading_list_pin_has_one_subject
    check ((path_id is null) <> (series_id is null)),

  constraint reading_list_pin_path_exists
    foreign key (path_id) references path (id) on delete cascade,
  constraint reading_list_pin_series_exists
    foreign key (series_id) references series (id) on delete cascade
);

comment on table reading_list_pin is
  'The only thing the Reading list stores. The list itself composes itself from active '
  'Paths and Series being collected and is a table nowhere; a pin is the owner''s '
  'disagreement with its order, and points at the source of an entry — a Path or a '
  'Series — because an entry has no stable row of its own.';

comment on column reading_list_pin.pinned_at is
  'The most recently pinned comes first: pinning is the act of saying "this next".';

-- One pin per subject. Pinning something already pinned is the owner saying *this next*
-- again, so the verb moves the pin it finds rather than adding a second one — and a second
-- one would be one decision counted twice in an order that is a permutation.
--
-- Two partial indexes rather than a primary key, because the subject is in one of two
-- columns and a key over both would let *(path, null)* and *(path, null)* differ by nothing
-- while still being two rows.
create unique index reading_list_pin_one_per_path
  on reading_list_pin (path_id) where path_id is not null;

create unique index reading_list_pin_one_per_series
  on reading_list_pin (series_id) where series_id is not null;
