-- Story, Reading, Rating: what the owner read and what they thought of it.
--
-- **No Volume is involved anywhere in this file**, and that is the point rather than
-- an omission. A Story needs no Volume at all — read digitally, borrowed, read on
-- someone else's shelf, or known only from Goodreads history — because being read and
-- being owned are two unrelated facts (ADR-0001). The object arrives later, in its own
-- table, and nothing here will have to move for it.
--
-- The three tables together are the corpus the whole application exists to expose: an
-- external reader answers "what should I read next" from these rows and from the
-- state derived off them (ADR-0002).

create table story (
  id         uuid        primary key default gen_random_uuid(),
  -- The narrative unit, at whatever granularity the owner chose for this one: *Gotham
  -- Noir* is a story inside one volume, *Slam Dunk* is a story across twenty. Nothing
  -- records which, because the choice is not a property of the story — it is the
  -- reason the same model holds both (ADR-0001).
  title      text        not null,
  -- An attribute of the Story, never a kind of thing (ADR-0006). Mandatory: every
  -- story the owner reads is one of the five, and a story without one would be
  -- invisible to every query that browses by Type.
  type_id    text        not null,
  created_at timestamptz not null default now(),

  constraint story_title_is_not_blank check (title = btrim(title) and title <> ''),
  -- Named rather than left to `story_type_id_fkey`, because a verb writes the prose the
  -- owner reads off the constraint that refused (`src/core/verbs/README.md`) and a
  -- generated name is a worse thing to match on.
  constraint story_type_exists foreign key (type_id) references type (id)
);

comment on table story is
  'The narrative unit the owner reads and forms an opinion about. Reachable with no '
  'Volume at all, and never reached *through* one (ADR-0001).';

create index story_by_type on story (type_id);

create table reading (
  id       uuid not null primary key default gen_random_uuid(),
  story_id uuid not null,

  -- Paper or digital, and a check rather than a table of its own — unlike Provenance.
  -- These two values are not a vocabulary that can grow: they are the model's own
  -- shape. Digital ownership is deliberately not modelled, so "digital" *means* a
  -- Reading with no Volume, and a third medium would be a change to the model rather
  -- than an insert (CONTEXT.md, ADR-0006).
  medium   text not null,

  -- How it ended, and **null while it is still being read**. The Story's state — to
  -- read / reading / read / abandoned — is derived from these rows and stored nowhere
  -- (see `src/core/queries/story.ts`), so "reading" has to be a fact about the act and
  -- not a status column on the Story. An unconcluded Reading is that fact.
  outcome  text,

  -- Both dates optional, and for different reasons. Goodreads history frequently
  -- carries the year and nothing else; a Reading in progress has no end yet. What is
  -- refused is the impossible pair rather than the incomplete one.
  started_on date,
  ended_on   date,

  -- Which is to say: how far this Reading can be trusted. Mandatory, because an
  -- unattributed reading would be weighed as a remembered one.
  provenance_id text not null,

  -- Free prose about this act of reading, distinct from the Rating's prose: this one
  -- says how it went, the Rating says what the story was worth.
  note       text,
  created_at timestamptz not null default now(),

  constraint reading_medium_is_paper_or_digital check (medium in ('paper', 'digital')),
  constraint reading_outcome_is_finished_or_abandoned
    check (outcome is null or outcome in ('finished', 'abandoned')),
  -- A Reading that has not concluded cannot have ended. The other three combinations
  -- are all real, including a finished Reading with no date at all.
  constraint reading_unconcluded_has_not_ended check (outcome is not null or ended_on is null),
  constraint reading_did_not_end_before_it_started
    check (started_on is null or ended_on is null or ended_on >= started_on),
  constraint reading_note_is_not_blank check (note is null or btrim(note) <> ''),

  constraint reading_story_exists foreign key (story_id) references story (id) on delete cascade,
  constraint reading_provenance_exists foreign key (provenance_id) references provenance (id),

  -- Nothing here says a Story has one Reading, and no unique constraint ever will:
  -- rereading is a real intention the owner has already recorded, so a Reading is
  -- never overwritten and the Rating it carried survives beside the next one
  -- (CONTEXT.md).

  -- What lets a Rating point at a Reading *and* at the same Story without the two
  -- being able to disagree. See `rating_belongs_to_the_read_story` below.
  constraint reading_id_and_story unique (id, story_id)
);

comment on table reading is
  'One act of reading a Story: an event, never a status field. Several for the same '
  'Story is the ordinary case, because rereading is.';

comment on column reading.outcome is
  'finished or abandoned; null while the Reading is still in progress.';

create index reading_by_story on reading (story_id, started_on desc nulls last);

create table rating (
  id       uuid not null primary key default gen_random_uuid(),

  -- **The judgement is of the Story, and of nothing else.** Every tool in this space
  -- hangs the rating off the object you bought; two cases in the owner's own
  -- collection break that, and ADR-0001 is the answer. There is deliberately **no
  -- volume column here, and there never will be**: a Rating on a Volume is not a
  -- mistake this table can make, because the column an insert would need does not
  -- exist. That is the refusal — structural, not a check somebody could forget to
  -- write. What the owner thinks of an *object* is an Edition note, which is a
  -- different thing on a different table.
  story_id uuid not null,

  -- Which act of reading produced this judgement, when the owner knows. Optional
  -- because a rating imported from a spreadsheet has no reading to point at, and it is
  -- what makes two Readings of one Story each keep their own Rating instead of the
  -- second opinion replacing the first.
  reading_id uuid,

  -- One scale for everything: 1 to 10 in half points (ADR-0001). The comics sheet used
  -- it already; the books sheet's 1-5 doubles into it on import and says so below.
  -- `numeric` with no scale, deliberately: `numeric(3,1)` would round 8.25 up to 8.5
  -- before the half-point check ever saw it, and silently accepting a score nobody
  -- gave is worse than refusing one.
  score numeric not null,
  -- Where the owner wrote some. The only judgement that feeds recommendation, and the
  -- prose is the most useful part of it.
  prose text,

  provenance_id text not null,

  -- A 7 that was originally a 3.5 out of 5 is not the same evidence as a 7 given in
  -- half points, and the recommender is told which it is holding (ADR-0001, CONTEXT.md
  -- on Provenance). Separate from `provenance_id` on purpose: the Provenance says where
  -- the score came from, this says what it lost on the way.
  converted_from_coarser_scale boolean not null default false,

  created_at timestamptz not null default now(),

  constraint rating_score_is_one_to_ten check (score >= 1 and score <= 10),
  constraint rating_score_is_in_half_points check (score * 2 = trunc(score * 2)),
  constraint rating_prose_is_not_blank check (prose is null or btrim(prose) <> ''),

  constraint rating_story_exists foreign key (story_id) references story (id) on delete cascade,
  constraint rating_provenance_exists foreign key (provenance_id) references provenance (id),

  -- One judgement per act of reading. A second thought about the same Reading is an
  -- edit of that Rating; a second thought after reading it again is a second Reading.
  constraint rating_is_one_per_reading unique (reading_id),

  -- A Rating cannot point at a Reading of some *other* Story. One composite reference
  -- rather than a plain one to `reading (id)`, so the two columns agree in the database
  -- rather than in whichever caller wrote them.
  --
  -- `set null (reading_id)` names the column deliberately: the bare form would null
  -- `story_id` too and a Rating detached from its Story is not a thing. Losing the
  -- Reading leaves the judgement standing on the Story, which is what a judgement of a
  -- Story means.
  constraint rating_belongs_to_the_read_story
    foreign key (reading_id, story_id) references reading (id, story_id)
    on delete set null (reading_id)
);

comment on table rating is
  'The owner''s judgement of a Story: 1 to 10 in half points, with prose where they '
  'wrote some. It never attaches to a Volume — the object was not the thing that was '
  'good or bad (ADR-0001) — and this table has no column with which it could.';

comment on column rating.converted_from_coarser_scale is
  'True when the score was converted from a coarser scale, so the recommender can '
  'weigh it as coarser.';

create index rating_by_story on rating (story_id, created_at desc);
