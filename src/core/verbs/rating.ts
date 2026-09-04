import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";

// Writing a Rating: the owner's judgement of a **Story**, 1 to 10 in half points, with
// prose where they wrote some.
//
// It never attaches to a Volume, and this file could not attach it to one if it tried:
// `rating` has no column an object could be written into (ADR-0001, and the migration
// says so at the column). What the owner thinks of an object is an Edition note, which
// is a different judgement on a different table and never feeds recommendation.

/**
 * The grain a score was given in — its own axis, and not a Provenance (ADR-0008).
 *
 * A literal union rather than a data row, where `credit_role` is a table: this one is not a
 * vocabulary that grows, it is the model's own shape. `half-points` is the owner's scale;
 * `coarse` is a score given out of 5 and doubled onto it, which the books sheet is full of. A
 * third grain would be a change to the model.
 *
 * **It is the half of ADR-0008 that stands.** A Pass's medium was the other example that ADR
 * gave of the same rule and it was the wrong side of it, because a console is a medium and
 * the list grows with the hardware industry; so the medium is a vocabulary now (ADR-0022) and
 * this is not. What changed is which of the two examples belonged where, never the rule.
 */
export type RatingScale = "coarse" | "half-points";

/** What setting a Rating needs. */
export type NewRating = {
  storyId: string;
  /** 1 to 10, in half points. One scale for comics and for books alike (ADR-0001). */
  score: number;
  /** A Provenance's slug — where this judgement came from, and how far it can be trusted. */
  provenanceId: string;
  /**
   * The grain it was given in. Defaults to `half-points`, which is the scale the owner
   * uses; a score doubled from a 1-5 one says `coarse` and keeps its own Provenance, which
   * is the whole point of the two being separate axes (ADR-0008).
   */
  scale?: RatingScale;
  /**
   * The Pass this judgement came out of, where the owner knows it. Absent for a score
   * imported from a sheet with no Pass to point at.
   *
   * **Still spelled the old way on purpose.** A field name is read by the screens and by the
   * MCP door, and this ticket renames the core without editing either (#57); it becomes
   * `passId` in the contract step (#60), with the call sites that say it.
   */
  readingId?: string | null;
  prose?: string | null;
};

/**
 * Record what the owner thought of a Story, replacing what they said before about the
 * same act of reading. Returns the Rating's id.
 *
 * **Set, in one sense of the word.** There is one Rating per Story per Pass, so
 * saying it again is an edit of the same judgement — whether or not it names a Pass.
 * A second opinion after reading the Story *again* is a second Pass carrying a Rating
 * of its own, and both survive: that is the only way a Story ends up with two.
 *
 * A score converted from a coarser scale says so in its `scale`, and says where it came
 * from in its Provenance. Those are two questions and the model answers both (ADR-0008,
 * correcting ADR-0001's one consequence): coarse-and-from-the-sheet and
 * coarse-and-from-Goodreads are different evidence, and a single Provenance value could
 * only ever have said one of the two.
 */
export async function setRating(rating: NewRating): Promise<string> {
  const rows = await refusing(
    () =>
      query<{ id: string }>(
        `insert into rating (story_id, pass_id, score, prose, provenance_id, scale)
         values ($1, $2, $3, $4, $5, $6)
         on conflict on constraint rating_is_one_per_story_and_pass do update
            set score = excluded.score,
                prose = excluded.prose,
                provenance_id = excluded.provenance_id,
                scale = excluded.scale,
                set_at = now()
         returning id`,
        [
          rating.storyId,
          rating.readingId ?? null,
          rating.score,
          rating.prose ?? null,
          rating.provenanceId,
          rating.scale ?? "half-points",
        ]
      ),
    (constraint) => {
      if (constraint === "rating_score_is_one_to_ten") return "A Rating is a score from 1 to 10.";
      if (constraint === "rating_score_is_in_half_points")
        return "A Rating moves in half points: 8, 8.5, 9.";
      if (constraint === "rating_prose_is_not_blank")
        return "A Rating's prose is either written or absent, never blank.";
      if (constraint === "rating_story_exists") return "That Story is not in the library yet.";
      if (constraint === "rating_provenance_exists")
        return "That is not a Provenance this library knows.";
      if (constraint === "rating_scale_is_coarse_or_half_points")
        return "A score was given either in half points or out of 5 and doubled: coarse or half-points.";
      if (constraint === "rating_belongs_to_the_story_passed_through")
        return "That Pass is not a Pass of this Story.";
      return "That Rating could not be recorded.";
    }
  );

  const [set] = rows;
  if (!set) throw new Error("insert into rating returned no row");
  return set.id;
}

/**
 * Strike a Rating: the library stops knowing the owner ever judged this.
 *
 * Returns the Story it was about, off the deleted row rather than out of the form
 * (`strikePath`, and `strikePass` beside it).
 *
 * **Nothing refuses it**, which is ADR-0016's answer rather than ADR-0014's four: no record
 * in this schema points at a Rating, so there is nothing that could be quietly changed by its
 * going and nothing to clear first. A score is the owner's own sentence about a narrative, and
 * a sentence they did not mean to write is a sentence they may unwrite.
 *
 * It exists as the other half of `strikePass`'s one refusal (ADR-0018): a rated pass stays
 * until the judgement goes, and a refusal the owner has no way to satisfy is the dead end that
 * door was opened to end. It is also the answer on its own to a score typed into the wrong
 * row, which `setRating` cannot give — setting it again replaces the number and still asserts
 * that the owner judged this book.
 *
 * **The owner's act and never the assistant's** (ADR-0005, ADR-0014).
 */
export async function strikeRating(ratingId: string): Promise<string> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ratingId)) {
    throw new Refusal("not-found", "That Rating is not in the library.");
  }

  const struck = await query<{ storyId: string }>(
    `delete from rating where id = $1 returning story_id as "storyId"`,
    [ratingId]
  );

  const [gone] = struck;
  if (!gone) throw new Refusal("not-found", "That Rating is not in the library.");

  return gone.storyId;
}
