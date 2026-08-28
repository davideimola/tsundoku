-- Type: Manga, Comic, Graphic Novel, Novel, Non-fiction.
--
-- One model covers all five, separated only by this attribute, and non-reading
-- collections arrive as a second bounded context rather than by widening this one
-- (ADR-0006). That ADR's one consequence is the shape of this table: **Type is
-- stored as data, not as an enum in code.** It costs nothing and it is the one cheap
-- thing that keeps the door open — a sixth Type is an insert, not a deployment, and
-- nothing in TypeScript enumerates these five.
--
-- The table is also the walking skeleton's proof that the path from schema to screen
-- is whole: the page reads these rows and nothing else.

create table type (
  -- A slug rather than a serial, because it is what an external assistant sees over
  -- MCP and `"manga"` is legible where `3` is not (ADR-0002).
  id            text    primary key,
  name          text    not null unique,
  display_order integer not null unique,

  -- Invariants live in Postgres: the database refuses what must never be true rather
  -- than trusting the application to remember.
  constraint type_id_is_a_slug check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint type_name_is_not_blank check (name = btrim(name) and name <> ''),
  constraint type_display_order_is_positive check (display_order > 0)
);

comment on table type is
  'An attribute of a Story, never a kind of thing: a novel and a tankobon differ in '
  'their attributes and never in their shape (ADR-0006). Stored as data so that a '
  'new Type is an insert rather than a deployment.';

comment on column type.id is 'Stable slug, and what MCP shows an external reader.';
comment on column type.name is 'What the owner reads on screen.';
comment on column type.display_order is 'The order the five are offered in.';

insert into type (id, name, display_order) values
  ('manga',         'Manga',         1),
  ('comic',         'Comic',         2),
  ('graphic-novel', 'Graphic Novel', 3),
  ('novel',         'Novel',         4),
  ('non-fiction',   'Non-fiction',   5);
