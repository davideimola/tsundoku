-- A Type says what going through it is called (#65, ADR-0021).
--
-- The door offers four sentences and two of them are about a narrative: *I read it* and *I
-- want to read it*. Both were written when every narrative in this library was printed, and
-- ADR-0021 stopped that being true — a videogame is a Story by the same test a manga is, and
-- the owner is asked to say they *read* one. `CONTEXT.md` already refuses `reading` for the
-- record itself, because it named half of what it holds; these two columns are the same
-- refusal reaching the one place the word survived, which is the wall.
--
-- **Two words and not one sentence.** What lives here is vocabulary — `read`, `played` — and
-- the sentence around it is copy, which belongs to the screen that says it. A column holding
-- *I want to play it.* would put the door's voice in the database, where nothing tests it and
-- the next screen wanting the same verb has to parse a sentence to find it.
--
-- **Two words and not one**, for the ordinary reason English has: *read* is its own past and
-- *play* is not, so a single column would spell *I want to played it* on the one Type this
-- whole change is for.
--
-- **The default is `read` and it is the honest one**, not a placeholder. Six of the seven
-- Types are things you read, so a Type inserted without an opinion is a printed one — which
-- keeps a new vocabulary row at one insert (ADR-0006), and leaves a Type that is *not* read
-- having to say so. The row below is the first that does.
ALTER TABLE "type" ADD COLUMN "verb_past" text DEFAULT 'read' NOT NULL;--> statement-breakpoint
ALTER TABLE "type" ADD COLUMN "verb_base" text DEFAULT 'read' NOT NULL;--> statement-breakpoint
ALTER TABLE "type" ADD CONSTRAINT "type_verb_past_is_a_word" CHECK (verb_past ~ '^[a-z]+$'::text);--> statement-breakpoint
ALTER TABLE "type" ADD CONSTRAINT "type_verb_base_is_a_word" CHECK (verb_base ~ '^[a-z]+$'::text);--> statement-breakpoint

-- **The one Type that is not read**, backfilled here rather than in a vocabulary file of its
-- own: this is not a new row and not a new vocabulary (ADR-0006, `README.md`) — it is the
-- column above being true the moment it exists. Left to a later file, the door would spend
-- one migration's worth of time offering *I read it* for Expedition 33.
UPDATE "type" SET verb_past = 'played', verb_base = 'play' WHERE id = 'videogame';--> statement-breakpoint

COMMENT ON COLUMN public.type.verb_past IS 'What a finished pass through a Story of this Type is called, in the past: read, played. The word alone and never the sentence around it - what the door says is the door''s copy, and a column holding a whole sentence would put a screen''s voice where nothing tests it. Defaults to read because six of the seven Types are printed, so a Type that is not read is the one that has to say so.';--> statement-breakpoint
COMMENT ON COLUMN public.type.verb_base IS 'The same verb in the plain form the door needs for an intention - read, play - because read is its own past and play is not, and one column would spell I want to played it on the one Type this exists for.';
