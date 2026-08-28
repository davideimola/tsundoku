-- Person and Credit: who wrote it and who drew it.
--
-- A **Credit** is a person's contribution to a **Story** in a named role. It hangs off
-- the Story and never off a Volume: the narrative is what a writer wrote and an artist
-- drew, and the object is a printing of it (ADR-0001). There is deliberately no
-- `volume_id` here, so a Credit on an object is not a mistake this table can make.
--
-- A **Person** is its own table rather than a name repeated on every Credit, because
-- *"everything I have read by Jeph Loeb"* is the question the owner asks before
-- committing to an omnibus (user story 15). A name stored per Credit would answer it
-- with a string comparison across two spellings; a row answers it with a join.
--
-- The word is Credit, never `author`: that one presumes a single role and silently
-- drops the artist, which is exactly the case the owner named — *One-Punch Man* is
-- written by ONE and drawn by Yusuke Murata (`CONTEXT.md`).

create table person (
  -- A generated id rather than a slug, unlike `credit_role`: these rows are people, not
  -- a vocabulary, and the owner adds one by naming it rather than by choosing from a
  -- list. Same reason `volume` has one.
  id         uuid        primary key default gen_random_uuid(),

  -- As the person is credited, in whatever script that is: `ONE`, `Yusuke Murata`,
  -- `Jeph Loeb`. One field and no split into given and family name — the collection is
  -- Japanese, Italian and American at once, and a name order imposed on all three would
  -- be wrong for two of them.
  name       text        not null,

  created_at timestamptz not null default now(),

  constraint person_name_is_not_blank check (name = btrim(name) and name <> '')
);

comment on table person is
  'Someone credited on a Story. Named once and pointed at from many Credits, so that '
  '"everything read by Jeph Loeb" is a join rather than a string comparison.';

-- One row per person, and the case is not what distinguishes two of them: `ONE` and
-- `one` are the same mangaka, and two rows for one person would split every answer the
-- table exists to give. An expression index rather than a `unique` on the column, so
-- that the name keeps the capitalisation the person is credited with.
--
-- The cost is that two genuinely different people with the same name cannot both be
-- recorded. That is the right way round: a collision is refused with prose and visible,
-- where a silent duplicate is neither.
create unique index person_is_named_once on person (lower(name));

create table credit (
  id         uuid        primary key default gen_random_uuid(),

  -- **The Story, and nothing else.** See the header: there is no volume column here and
  -- there never will be one.
  story_id   uuid        not null,
  person_id  uuid        not null,
  role_id    text        not null,

  created_at timestamptz not null default now(),

  -- Named rather than left to the generated `credit_story_id_fkey`, because a verb
  -- writes the prose the owner reads off the constraint that refused
  -- (`src/core/verbs/README.md`) and a generated name is a worse thing to match on.
  constraint credit_story_exists foreign key (story_id) references story (id) on delete cascade,
  constraint credit_person_exists foreign key (person_id) references person (id),
  constraint credit_role_exists foreign key (role_id) references credit_role (id),

  -- One person holds one role on one Story once, and this is the only uniqueness there
  -- is. What it deliberately leaves possible is the whole shape of the model:
  --
  --   * **one person in both roles on the same Story** — ONE writes and draws his own
  --     one-shots, and Murata does both on *Eyeshield 21* covers — because the
  --     constraint does not mention `(story_id, person_id)`;
  --   * **two people in the same role** — a writing duo — because it does not mention
  --     `(story_id, role_id)` either.
  constraint credit_is_one_role_per_person_per_story unique (story_id, person_id, role_id)
);

comment on table credit is
  'A person''s contribution to a Story in a named role. One person may hold both '
  'roles on the same Story, and the two are routinely different people.';

-- The two directions the Credits are read in, and both are a screen. By Story: the
-- Story page and the MCP read of one. By person: everything read by one Credit.
create index credit_by_story on credit (story_id);
create index credit_by_person on credit (person_id);
