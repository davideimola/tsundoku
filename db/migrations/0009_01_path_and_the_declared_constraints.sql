-- Path: an ordered route through Stories that the **owner** defines, crossing Types,
-- publishers and series freely — *Recupero Batman*, *Angolo Giappone*, *Technical
-- Leadership*. Today they live in a prose cell and the `Prossimo` column beside them is
-- recomputed by hand; here the route is rows and what comes next is a query (#1).
--
-- **Its order is a judgement, never a publication sequence** (CONTEXT.md), and that is
-- structural in this file rather than a rule somebody remembers: `path_item` has no
-- series column, no volume column and no publication number, so there is nothing here
-- an order could be derived *from*. The only ordering is `position`, and the only thing
-- that writes it is the owner's verb.
--
-- A Path reaches the reading axis and nothing else. It points at Stories, so it crosses
-- Types and publishers for free: a Type is an attribute of a Story (ADR-0006), and a
-- publisher is a property of a Volume, which this file never mentions.

create table path (
  id     uuid primary key default gen_random_uuid(),

  -- What the owner calls the route. Their words, kept as typed.
  name   text not null,

  -- **The intent, in the owner's own words** — "privilegiare titoli davvero coerenti con
  -- samurai e cultura giapponese". Prose, and prose is data here: the external
  -- recommender reads it to extend a route the owner already chose (ADR-0002, user story
  -- 21), so it is neither UI copy nor a note to self.
  --
  -- Nullable, because a route can exist before the owner has the words for it and
  -- refusing to record *Recupero Batman* until a paragraph is written would keep the
  -- route in the prose cell it came from. Blank is refused rather than stored, so
  -- "no intent" has exactly one representation.
  intent text,

  -- Active or inactive. The Reading list composes itself from the **active** Paths only
  -- (CONTEXT.md, user story 22), so this column is what puts a route aside without
  -- deleting it — *Angolo Giappone* paused for a year is not *Angolo Giappone* forgotten.
  --
  -- A boolean rather than a state table: there are two cases and a third would be a
  -- change to what the Reading list reads, not an insert.
  active boolean not null default true,

  created_at timestamptz not null default now(),

  constraint path_name_is_not_blank check (name = btrim(name) and name <> ''),
  constraint path_intent_is_not_blank check (intent is null or btrim(intent) <> '')
);

comment on table path is
  'An ordered route through Stories that the owner defines. Its order is the owner''s '
  'judgement and is derived from nothing; its intent is prose the external recommender '
  'reads (ADR-0002).';

comment on column path.intent is
  'The owner''s own words about what the route is for. Data, read over MCP.';

comment on column path.active is
  'The Reading list composes itself from the active Paths only.';

-- One route per name, whatever case the owner typed it in: two *Angolo Giappone* would
-- be a mistake made twice rather than two routes. On `lower(name)` because the name is
-- prose the owner retypes, not an identifier.
create unique index path_name_names_one_route on path (lower(name));

create table path_item (
  path_id  uuid not null,
  story_id uuid not null,

  -- **Where the owner put this Story on the route**, and the whole of the order.
  --
  -- `numeric` with gaps rather than a dense `1, 2, 3`, and that is the answer to how
  -- re-ordering works without rewriting every row: appending takes `max + 1024`, and
  -- moving a Story between two others takes the **midpoint of its two new neighbours**,
  -- so one row is written however long the route is. `numeric` is arbitrary precision in
  -- Postgres and the verb halves a gap by multiplying by `0.5` rather than dividing by
  -- 2 — multiplication keeps every digit, where division rounds to sixteen significant
  -- ones — so a gap can be halved as many times as the owner has decisions to make and
  -- two neighbours never collapse onto one value the way a float or an integer would.
  --
  -- The alternative — a dense sequence — makes moving the last Story of a forty-Story
  -- route to the front a forty-row update, and forty rows written to record one decision
  -- is a re-numbering pretending to be a judgement.
  position numeric not null,

  -- When the owner put it on the route. Not the order: two Stories added in one sitting
  -- are ordered by the judgement below and not by the clock.
  added_at timestamptz not null default now(),

  -- A Story is on a route once or not at all. Reading it twice is two Readings, which is
  -- a fact about the act; the route is a plan, and a plan that visits the same stop
  -- twice is a mistake in it.
  constraint path_item_is_one_stop primary key (path_id, story_id),

  -- The order is total: no two Stories share a place on the same route, so "what comes
  -- next" has one answer rather than one the query picks.
  constraint path_item_position_is_one_place unique (path_id, position),
  constraint path_item_position_is_positive check (position > 0),

  constraint path_item_path_exists foreign key (path_id) references path (id) on delete cascade,
  -- A route is a plan over Stories, so a Story leaving the library takes its stop with
  -- it. Nothing is judged here and nothing is lost by the cascade.
  constraint path_item_story_exists foreign key (story_id) references story (id) on delete cascade
);

comment on table path_item is
  'One Story''s place on one Path. `position` is the owner''s judgement, spaced so that '
  'a re-order writes one row; there is deliberately no column an order could be derived '
  'from.';

comment on column path_item.position is
  'Sparse and numeric: a move is the midpoint of the two new neighbours.';

-- What "the route, in order" reads, and what the next unread Story is found through.
create index path_item_in_order on path_item (path_id, position);

-- The owner's **declared constraints**: "don't accumulate too many unread books", "take
-- it slowly, given the cost".
--
-- They are here rather than in a notes field because they are **instructions to the
-- external advisor** rather than notes to self (ADR-0002, user story 25): an assistant
-- that cannot read them suggests six books to someone who asked for one.
--
-- **One table for both scopes, with `path_id` nullable.** A constraint that belongs to
-- *Angolo Giappone* — "take it slowly, given the cost" — and one that holds over the
-- whole library are the same kind of sentence said about a different subject, and the
-- advisor reads them in one breath. Two tables would mean two shapes and two queries for
-- one concept, and the "global" one would need a table whose only row-defining property
-- is that it has no subject. So: `path_id is null` **is** the global scope, and it is a
-- scope rather than a missing value.
create table declared_constraint (
  id      uuid primary key default gen_random_uuid(),

  -- Which route this holds over, or **null for the whole library**.
  path_id uuid,

  -- The sentence, as the owner said it. There is nothing to parse here and nothing in
  -- this application will try: the reader is an assistant, and prose is the format it is
  -- best at (ADR-0002).
  prose   text not null,

  declared_at timestamptz not null default now(),

  constraint declared_constraint_prose_is_not_blank
    check (prose = btrim(prose) and prose <> ''),
  constraint declared_constraint_path_exists
    foreign key (path_id) references path (id) on delete cascade
);

comment on table declared_constraint is
  'What the owner has declared about how they want to read, in prose. On a Path, or '
  'globally when path_id is null. Read through MCP as instructions to the external '
  'advisor, never interpreted here (ADR-0002).';

comment on column declared_constraint.path_id is
  'The Path it holds over. Null is the global scope, not a missing value.';

create index declared_constraint_by_path on declared_constraint (path_id, declared_at);
