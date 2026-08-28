-- The Inbox: what an external assistant asked for and the owner has not decided yet.
--
-- It is the other half of ADR-0005. The MCP door runs verbs on entities that already
-- exist — record a Reading, set a Rating, acquire a Volume, open a Wish — because those
-- are narrow, reversible and wrong in an obvious way. It may only **propose** a Story, a
-- Volume or a Series, because that is where a hallucinated title or a fabricated edition
-- becomes a permanent fact the owner carries forever. A proposal is a row in this table.
--
-- **A first-class entity, not a log.** The Inbox is the owner's own design: the
-- spreadsheet's `Inbox` tab already carries `Segnalazione, Tipo, Titolo / Riferimento,
-- Dettagli grezzi, Azione, Stato` and one demonstration row — *"Ho comprato Ultimate
-- Spider-Man Omnibus 1"*. Five of those six columns are below. `Azione` is not, and that
-- is ADR-0005 rather than an omission: in the sheet the owner wrote what should happen
-- (*Sposta in Collezione*) because nothing else could work it out, and here the action is
-- fixed by `proposes` — approving a proposed Volume catalogues that Volume, and there is
-- no second thing an approval can do. A column that could only ever hold one value per
-- kind would be a place for the sheet and the model to disagree.
--
-- **Approval is the act that creates the entity, and nothing before it writes.** There is
-- no draft row in `story`, no `volume` with a pending flag, no `series` waiting to be
-- confirmed: this table is the only trace a proposal leaves, so a rejected entry leaves
-- nothing at all in the domain. That is the whole invariant, and the reason `details` is
-- one opaque document rather than a mirror of three tables' columns — a shadow schema
-- would drift from the real one and would tempt somebody into promoting a row by
-- flipping a flag.

create table inbox_entry (
  id          uuid primary key default gen_random_uuid(),

  -- `Segnalazione`: what was said, in the words it was said in. The sentence the
  -- assistant relayed — *"Ho comprato Ultimate Spider-Man Omnibus 1"* — and the thing
  -- the owner actually reads when deciding, because it is the only column that says why
  -- any of this is being asked. Prose, never a code: the point of keeping it is that it
  -- was not normalised.
  reported    text not null,

  -- `Tipo`: which of the three entities is being proposed. Three values and not four —
  -- ADR-0005 names a Story, a Volume and a Series, and nothing else may be created this
  -- way, so anything not on that list is refused by the database rather than by a
  -- convention somebody has to remember.
  --
  -- Deliberately **not** called `type`: `Type` is Manga / Comic / Graphic Novel / Novel /
  -- Non-fiction, an attribute of a Story (CONTEXT.md), and one word cannot mean both
  -- here. A proposed Story carries its Type inside `details`, where it belongs.
  proposes    text not null,

  -- `Titolo / Riferimento`: the title or the reference as given, and the one field a
  -- proposal cannot be without — an entry naming nothing is not something the owner can
  -- decide about. It is also what makes two proposals of the same thing recognisable to
  -- the eye, which is all the deduplication this table attempts: an assistant proposing
  -- Omnibus 1 twice is two entries, and the owner rejecting one of them is one tap.
  reference   text not null,

  -- `Dettagli grezzi`: everything else the assistant supplied, exactly as it supplied it
  -- — a publisher, an edition line, a Binding it guessed, a count of volumes it read off
  -- a shop page. **Raw on purpose.** These values are the untrusted ones, so nothing here
  -- is a foreign key, nothing is checked against a vocabulary, and nothing in this
  -- document can be true or false until the owner has looked at it. It becomes an
  -- argument to a verb at approval and meets that verb's constraints there.
  details     jsonb not null default '{}',

  proposed_at timestamptz not null default now(),

  -- `Stato`, as two columns and no enum: waiting is `decided_at is null`, and a decided
  -- entry says which way it went. The state is derived from these rather than stored
  -- beside them, like every other state in this schema — the day of the decision is a
  -- fact worth keeping and a `status` column beside it would be a second place to read
  -- the same thing from.
  decided_at  timestamptz,
  outcome     text,

  -- What the approval made: a `story.id`, a `volume.id` or a `series.id` depending on
  -- `proposes`. It is the receipt — the entry the owner approved can say *this is the row
  -- it became* — and it is what makes an approved entry unrepeatable in a way anybody can
  -- read.
  --
  -- No foreign key, because a reference to one of three tables is not something Postgres
  -- can declare and the alternatives are worse: three nullable columns would be three
  -- ways to say one thing, and a fourth table pointing at each would be a join for a
  -- receipt. The three tables' rows are never deleted, so it cannot rot.
  created_id  uuid,

  constraint inbox_entry_reported_is_not_blank
    check (reported = btrim(reported) and reported <> ''),
  constraint inbox_entry_reference_is_not_blank
    check (reference = btrim(reference) and reference <> ''),
  constraint inbox_entry_proposes_a_story_volume_or_series
    check (proposes in ('story', 'volume', 'series')),
  constraint inbox_entry_details_is_a_document check (jsonb_typeof(details) = 'object'),
  constraint inbox_entry_outcome_is_approved_or_rejected
    check (outcome is null or outcome in ('approved', 'rejected')),
  -- Decided is one event: the day and the answer arrive together or neither does.
  constraint inbox_entry_is_decided_once check ((decided_at is null) = (outcome is null)),
  -- An approval that created nothing did not happen, and a rejection that created
  -- something is exactly the thing this table exists to prevent. Both halves, so the
  -- database refuses a trace in the domain rather than trusting the verb to.
  constraint inbox_entry_approval_names_what_it_created
    check ((outcome is not distinct from 'approved') = (created_id is not null))
);

comment on table inbox_entry is
  'What an external assistant asked for and the owner has not decided yet (ADR-0005). '
  'Creating a Story, Volume or Series over MCP is impossible; the attempt lands here as '
  'a proposal, and approval is the act that creates the entity. A rejected entry leaves '
  'no trace in the domain, because this row is the only trace a proposal ever had.';

comment on column inbox_entry.reported is
  'What was said, in the words it was said in. The sheet''s Segnalazione.';
comment on column inbox_entry.proposes is
  'story, volume or series - the three ADR-0005 allows to be proposed. Not called type: '
  'Type is an attribute of a Story and lives in details.';
comment on column inbox_entry.reference is 'The title or reference as given.';
comment on column inbox_entry.details is
  'Everything else the assistant supplied, untrusted and unchecked. It becomes an '
  'argument to a verb at approval and meets that verb''s constraints there.';
comment on column inbox_entry.decided_at is 'Null is waiting, and waiting is the Inbox.';
comment on column inbox_entry.created_id is
  'The story, volume or series the approval created. Null on a rejected or waiting entry.';

-- Deliberately no index. The sheet's Inbox has one row in it, the screen reads every
-- waiting entry and sorts them, and an index over that would be a claim nobody had
-- measured.
