-- The roles a Credit can be held in: writer, artist.
--
-- Stored as data rather than as a check constraint, for the reason Type, Binding and
-- Provenance are (ADR-0006): this is a **vocabulary**, and comic credits are the
-- clearest case of one that grows — a colourist, a letterer, an inker, a translator
-- and a cover artist are all roles the owner will meet, and the spreadsheet import
-- (#14) has no author column at all, so the two rows seeded here are a starting
-- vocabulary rather than the whole of it. A seventh role is an insert, not a release.
--
-- Contrast a Reading's medium, which *is* a check constraint two migrations back: paper
-- and digital are not a vocabulary that can grow, they are the model's own shape, and a
-- third medium would be a change to the model. Roles are not like that. Nothing in
-- TypeScript enumerates these.

create table credit_role (
  -- A slug rather than a serial, because it is what an external assistant reads over
  -- MCP where a Story's Credits are exposed: `"artist"` is legible where `2` is not
  -- (ADR-0002).
  id            text    primary key,
  name          text    not null unique,
  display_order integer not null unique,

  constraint credit_role_id_is_a_slug check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint credit_role_name_is_not_blank check (name = btrim(name) and name <> ''),
  constraint credit_role_display_order_is_positive check (display_order > 0)
);

comment on table credit_role is
  'The named role a person''s contribution to a Story is held in. Stored as data so '
  'that a colourist or a letterer is an insert; the word `author` is deliberately not '
  'among them, because it presumes a single role and silently drops the artist.';

comment on column credit_role.id is 'Stable slug, and what MCP shows an external reader.';

-- Writer and artist, which are the two `CONTEXT.md` names, in the order a comic is
-- credited in. `author` is deliberately absent and must never be added: it presumes a
-- single role and silently drops the artist, which is the confusion this table exists
-- to refuse.
insert into credit_role (id, name, display_order) values
  ('writer', 'Writer', 1),
  ('artist', 'Artist', 2);
