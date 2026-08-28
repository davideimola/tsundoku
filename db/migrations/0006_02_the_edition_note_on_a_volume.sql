-- Edition note: what the owner thinks of a Volume **as an object** — print quality,
-- translation, value for money, whether the Must Have was the right way to try the saga
-- before committing to the omnibus. It decides what to buy.
--
-- **It is not a Rating, and this table is shaped so that it cannot become one.** There is
-- no score column here and there never will be, exactly as `rating` has no volume column
-- and never will (ADR-0001): the refusal is structural rather than a check somebody could
-- forget to write. The two judgements are different judgements about different things —
-- one is of the narrative and feeds recommendation, the other is of the paper and must
-- never reach it.
--
-- A table of its own rather than a column on `volume`, for the same reason. The Collection
-- is what the MCP door exposes, and a prose column sitting on `volume` would be one
-- `select v.*` away from arriving in an assistant's context as if it were an opinion of
-- the story. Here, reading it takes a join that no recommendation query has any reason to
-- write — and `src/core/queries/edition-note.test.ts` asserts that none of them does.

create table edition_note (
  -- One note per Volume, and the primary key is what says so. A second thought about the
  -- same object replaces the first: unlike a Rating — which stands beside the next one,
  -- because rereading is a second act — an opinion of an object is a standing verdict and
  -- not an event. Print quality does not happen twice.
  volume_id  uuid        primary key,
  note       text        not null,
  -- When the owner last wrote it, which is the only date this judgement has.
  written_at timestamptz not null default now(),

  constraint edition_note_is_not_blank check (note = btrim(note) and note <> ''),

  -- The note is about the object, so it goes when the object's row goes. Releasing a
  -- Volume does not delete its row, so what the owner thought of a Volume they no longer
  -- own survives — which is the point of keeping the row at all.
  constraint edition_note_volume_exists
    foreign key (volume_id) references volume (id) on delete cascade
);

comment on table edition_note is
  'What the owner thinks of a Volume as an object. Not a score, and there is no column '
  'here that could hold one: it decides what to buy and never feeds recommendation '
  '(ADR-0001, CONTEXT.md).';

comment on column edition_note.note is 'Prose, and the whole of the judgement.';
