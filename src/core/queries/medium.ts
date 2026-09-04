import "server-only";

import { asc } from "drizzle-orm";

import { medium } from "../../../db/schema.ts";
import { db } from "../db.ts";

// The medium: what a **Pass** went through the Story by — paper, digital, or the console it
// was played on.
//
// It is a **vocabulary and therefore data** (ADR-0022), read here rather than enumerated for
// the same reason Type, Binding and Provenance are: the list grows when a console is
// released, and that is an insert rather than a release. It used to be two values written
// into a check constraint, which looked like the model's own shape only because, in a library
// of printed things, paper and digital are an exhaustive pair.

/** One medium, and whether a pass by it can have gone through an object. */
export type Medium = {
  /** The slug a Pass carries: `paper`, `digital`. */
  id: string;
  /** What the owner reads on screen. */
  name: string;
  /**
   * **Whether a pass by this medium goes through an object**, which today is paper alone.
   *
   * One column carrying what used to be two hand-written rules (ADR-0022). The database
   * refuses a Pass that names a Volume by a medium that does not go through one — the
   * sentence `pass_digital_went_through_no_volume` used to say by naming a value — and the
   * **Pile** reads the same flag to answer *can I start this tonight*: a medium that needs no
   * object needs nothing, and one that does needs the object in the house. Neither rule
   * mentions a value any more, which is what makes them survive a fourth console.
   */
  goesThroughAnObject: boolean;
};

/**
 * Every medium, in the order they are offered in.
 *
 * Written against the schema rather than as SQL for `listBindings`' reason: there is nothing
 * here to derive, only three columns off one table in a stated order.
 */
export async function listMedia(): Promise<Medium[]> {
  return db()
    .select({
      id: medium.id,
      name: medium.name,
      goesThroughAnObject: medium.goesThroughAnObject,
    })
    .from(medium)
    .orderBy(asc(medium.displayOrder));
}
