-- A Story carries an image of the owner's own (#65, ADR-0013, ADR-0021).
--
-- **One column, and it is the one place a videogame needs something a book did not.** A cover
-- hangs on the Volume because a narrative is not an object (ADR-0001), and what a Story wears
-- on a wall is borrowed from the first Volume carrying it. A game carries no Volume — the
-- owner has weighed a disc on the shelf and found it says nothing worth recording (ADR-0021)
-- — so there is nothing for it to borrow a face from, and until now nothing it could ever
-- wear.
--
-- The alternative was a Volume-shaped record with no object behind it, which would reintroduce
-- exactly the collector's half the whole feature declined. A column on the narrative is the
-- cheap and honest answer, and it is a column for the narrative's *own* image only:
--
--   own_image_url   the owner's own photograph, screenshot or scan, hosted by them, standing
--                   for the work itself rather than for any printing of it
--
-- **Nothing is ever looked up onto a Story, and this column is why that stays true.** There is
-- no `cover_source`, no `cover_url` and no `cover_looked_up_at` beside it, because every
-- source is keyed by an ISBN and a narrative has none — a game least of all. A looked-up cover
-- stays what ADR-0013 made it: somebody else's, revocable, 128 pixels wide, and attached to an
-- object. The hotlink constraint is on `volume` and is untouched.
--
-- **The prohibition is a constraint rather than a habit**, exactly as it is for a Volume:
-- `story_own_image_is_the_owners_own` refuses an address on either looked-up source's own
-- domain, so the escape hatch cannot quietly become a second place a third party's bytes are
-- claimed as the owner's. It is the Volume's own regex, said again about the other table,
-- because it is the same prohibition about the same two domains.
--
-- **The precedence is written down here and resolved once in `src/core/queries/story.ts`.**
-- The image nearest the record wins: the Story's own image first, then whatever the lending
-- Volume is faced with — which is itself the owner's photograph over the looked-up cover
-- (`THE_COVER_IT_IS_FACED_WITH`). Both of the first two are the owner's; the Story's is about
-- the narrative the tile *is*, where the Volume's is borrowed off one of however many objects
-- carry it, so the nearer one leads. A Story with no image at all is the drawn tile, which is
-- the ordinary case and not a gap.
--
-- Hand-written rather than generated, like every migration that carries its own argument
-- (ADR-0009): the `comment on` below is where the schema documents itself.

ALTER TABLE "story" ADD COLUMN "own_image_url" text;--> statement-breakpoint
ALTER TABLE "story" ADD CONSTRAINT "story_own_image_is_the_owners_own" CHECK ((own_image_url IS NULL) OR ((own_image_url ~ '^https://[^ ]+$'::text) AND (own_image_url !~ '^https://((bks[0-9]+\.)?books\.google\.com|covers\.openlibrary\.org)/'::text)));--> statement-breakpoint

COMMENT ON COLUMN public.story.own_image_url IS 'The owner''s own photograph, screenshot or scan of the work, hosted by them, which the narrative wears over anything an object carrying it lends (ADR-0013, #65). The only image a Story can ever have: every cover source is keyed by an ISBN, a narrative has none, and a videogame carries no object to borrow a face from at all.'
