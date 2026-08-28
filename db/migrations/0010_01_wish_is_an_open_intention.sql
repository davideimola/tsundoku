-- Wish: an open intention to acquire a *named Volume* — priority, target price, price
-- found, shop. It is the wishlist as a shopping list rather than a wish-shaped diary,
-- which is why every column here is a number or a name that decides a purchase.
--
-- **There is no state column, and that is the point.** The spreadsheet's Wishlist keeps
-- `Acquistato` among its wish states, and `Acquistato` is not a state a wish is in: it is
-- a wish that *ended*. So the only thing this table records about the end of a Wish is the
-- day it ended on, and the confusion is not merely unused here — it is unrepresentable.
-- There is no enum, no `status`, no `acquired` flag and no boolean to set: nothing in this
-- table can say that a Wish was fulfilled as opposed to abandoned, because the owner asked
-- for neither. Open Wishes are the shopping list; the rest is history.
--
-- **A Wish ends only by a deliberate act.** Nothing derives `closed_on` — no trigger on
-- `volume`, no default beyond null, no cascade — because acquiring the Volume is not the
-- same event as deciding to stop wanting it, and the owner's stated reason is that nothing
-- should silently disappear from what they meant to buy. `close_wish` in
-- `src/core/verbs/wish.ts` is the only writer of that column.
--
-- **"Complete this series" is not a Wish**, so there is no series_id here and no nullable
-- target of two kinds. That intention is the collecting decision on a Series, and the
-- missing Volumes follow from it as a query rather than as rows typed by hand.

create table wish (
  id           uuid primary key default gen_random_uuid(),

  -- The Volume the owner means to buy — the concrete object, never a Story and never a
  -- Series. A hard reference rather than a remembered title: a Wish that named prose could
  -- not tell the owner in a shop *this is the one I wanted*, which is the only reason the
  -- list exists. Volumes are never deleted (a released one keeps its row), so this
  -- reference cannot rot.
  volume_id    uuid not null references volume (id),

  -- Which one to buy first. 1 is next, 3 is someday: three steps rather than a rank the
  -- owner renumbers, because a shopping list is read in groups — *what am I buying this
  -- month* — and a total order over twenty rows is a chore nobody keeps true.
  priority     integer not null,

  -- The two numbers that decide a purchase, in euro, and both optional: a Wish opened
  -- because the owner wants the book is a real Wish before any price is known. `numeric`
  -- rather than a float, for the reason every price in this schema is — money that
  -- arrives as `24.90` leaves as `24.90`.
  target_price numeric(10, 2),
  price_found  numeric(10, 2),

  -- Where it was found at that price. Prose, deliberately: a shop is a name the owner
  -- reads — `Amazon`, `Star Shop`, `quel fumettaro a Verona` — and a vocabulary of shops
  -- would be a table nobody maintains.
  shop         text,

  opened_on    date not null default current_date,

  -- The day the intention ended, and the whole of what this table says about ending.
  -- Null is open, and open is the shopping list. A day is a Wish the owner deliberately
  -- closed — bought elsewhere, bought here, or no longer wanted, and this schema does not
  -- claim to know which.
  closed_on    date,

  constraint wish_priority_is_one_to_three check (priority between 1 and 3),
  constraint wish_target_price_is_not_negative check (target_price is null or target_price >= 0),
  constraint wish_price_found_is_not_negative check (price_found is null or price_found >= 0),
  constraint wish_shop_is_not_blank check (shop is null or (shop = btrim(shop) and shop <> '')),
  -- A Wish cannot have ended before it was opened.
  constraint wish_close_follows_open check (closed_on is null or closed_on >= opened_on)
);

comment on table wish is
  'An open intention to acquire a named Volume. There is deliberately no state column: '
  'a fulfilled Wish is a Wish that ended, so the end is a day and `Acquistato` is not '
  'representable. Nothing but the close verb writes closed_on.';

comment on column wish.priority is 'Which to buy first: 1 next, 2 soon, 3 someday.';
comment on column wish.closed_on is
  'Null is an open Wish, and the shopping list. A day is a Wish the owner ended.';

-- One open Wish per Volume. A second one would make the shopping list say *buy this*
-- twice for one object, and the owner would have to work out which of the two carried
-- the price they had found. Partial, so the history is unbounded: the same Volume can be
-- wished again after a Wish on it was closed, which is a real event — the copy sold
-- before the owner got there.
create unique index wish_one_open_per_volume on wish (volume_id) where closed_on is null;

-- Deliberately no index for the shopping list. It reads every open Wish and sorts them;
-- there are twenty-one rows in the sheet it comes from, and an index over that would be a
-- claim nobody had measured.
