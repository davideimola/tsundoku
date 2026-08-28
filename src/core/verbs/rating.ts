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

/** What setting a Rating needs. */
export type NewRating = {
  storyId: string;
  /** 1 to 10, in half points. One scale for comics and for books alike (ADR-0001). */
  score: number;
  /** A Provenance's slug — how far this judgement can be trusted. */
  provenanceId: string;
  /**
   * The act of reading this judgement came out of, where the owner knows it. Absent for
   * a score imported from a sheet with no Reading to point at.
   */
  readingId?: string | null;
  prose?: string | null;
  /**
   * True when the score was converted from a coarser scale — the books sheet's 1-5
   * doubled into this one — so that the recommender weighs it as coarser (#14).
   */
  convertedFromCoarserScale?: boolean;
};

/**
 * Record what the owner thought of a Story. Returns the Rating's id.
 *
 * When it names a Reading it **replaces that Reading's Rating**, because one act of
 * reading produced one judgement and a second thought about the same reading is an edit
 * of it. A second thought after reading the story *again* is a second Reading with a
 * Rating of its own, and both survive.
 *
 * When it names no Reading it adds a judgement of the Story standing on its own; those
 * accumulate rather than replace, since nothing identifies which of them the owner meant
 * to correct.
 */
export async function setRating(rating: NewRating): Promise<string> {
  const rows = await refusing(
    () =>
      query<{ id: string }>(
        `insert into rating
           (story_id, reading_id, score, prose, provenance_id, converted_from_coarser_scale)
         values ($1, $2, $3, $4, $5, $6)
         on conflict on constraint rating_is_one_per_reading do update
            set score = excluded.score,
                prose = excluded.prose,
                provenance_id = excluded.provenance_id,
                converted_from_coarser_scale = excluded.converted_from_coarser_scale
         returning id`,
        [
          rating.storyId,
          rating.readingId ?? null,
          rating.score,
          rating.prose ?? null,
          rating.provenanceId,
          rating.convertedFromCoarserScale ?? false,
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
      if (constraint === "rating_belongs_to_the_read_story")
        return "That Reading is not a Reading of this Story.";
      return "That Rating could not be recorded.";
    }
  );

  const [set] = rows;
  if (!set) throw new Error("insert into rating returned no row");
  return set.id;
}
