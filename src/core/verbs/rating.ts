import "server-only";

import { query } from "../db.ts";
import { refusing } from "../refusal.ts";

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
 * A literal union rather than a data row, for the reason a Reading's medium is a check
 * constraint and `credit_role` is a table: these two are not a vocabulary that grows, they
 * are the model's own shape. `half-points` is the owner's scale; `coarse` is a score given
 * out of 5 and doubled onto it, which the books sheet is full of. A third grain would be a
 * change to the model.
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
   * The act of reading this judgement came out of, where the owner knows it. Absent for
   * a score imported from a sheet with no Reading to point at.
   */
  readingId?: string | null;
  prose?: string | null;
};

/**
 * Record what the owner thought of a Story, replacing what they said before about the
 * same act of reading. Returns the Rating's id.
 *
 * **Set, in one sense of the word.** There is one Rating per Story per Reading, so
 * saying it again is an edit of the same judgement — whether or not it names a Reading.
 * A second opinion after reading the Story *again* is a second Reading carrying a Rating
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
        `insert into rating (story_id, reading_id, score, prose, provenance_id, scale)
         values ($1, $2, $3, $4, $5, $6)
         on conflict on constraint rating_is_one_per_story_and_reading do update
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
      if (constraint === "rating_belongs_to_the_read_story")
        return "That Reading is not a Reading of this Story.";
      return "That Rating could not be recorded.";
    }
  );

  const [set] = rows;
  if (!set) throw new Error("insert into rating returned no row");
  return set.id;
}
