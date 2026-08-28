-- Binding: how a Volume is bound — tankobon, omnibus, deluxe, Must Have, hardcover,
-- paperback. It is what an Edition note usually judges.
--
-- The word is Binding and never `format`: in the spreadsheets that one word meant
-- binding in one sheet and reading medium in the other, and served neither.
--
-- Stored as data rather than as an enum in code, for the reason Type is (ADR-0006):
-- the vocabulary is closed-ish rather than closed — a bunkoban, a kanzenban or an
-- absolute edition is a Binding the owner will meet — and a seventh row is an insert
-- rather than a deployment. Nothing in TypeScript enumerates these six.

create table binding (
  -- A slug rather than a serial, because it is what an external assistant reads over
  -- MCP, where the Collection is exposed with its Binding: `"must-have"` is legible
  -- where `4` is not (ADR-0002).
  id            text    primary key,
  name          text    not null unique,
  display_order integer not null unique,

  constraint binding_id_is_a_slug check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint binding_name_is_not_blank check (name = btrim(name) and name <> ''),
  constraint binding_display_order_is_positive check (display_order > 0)
);

comment on table binding is
  'How a Volume is bound. A property of the object, never of the reading: the medium '
  'a Story was read by belongs to a Reading, and the two words were the same word in '
  'the spreadsheets. Stored as data so that a new Binding is an insert.';

comment on column binding.id is 'Stable slug, and what MCP shows an external reader.';
comment on column binding.name is 'What the owner reads on screen.';

insert into binding (id, name, display_order) values
  ('tankobon',  'Tankōbon',  1),
  ('omnibus',   'Omnibus',   2),
  ('deluxe',    'Deluxe',    3),
  ('must-have', 'Must Have', 4),
  ('hardcover', 'Hardcover', 5),
  ('paperback', 'Paperback', 6);
