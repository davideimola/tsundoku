import "server-only";

import { query } from "../db.ts";

// Provenance: how a record came to be known, and therefore how far it can be trusted.
//
// It is read rather than enumerated, for the same reason Type and Binding are: these are
// data rows and a new one is an insert, not a release (ADR-0006's posture, applied where it
// applies). Nothing in TypeScript lists them, and the description travels with the id
// because the whole value of a Provenance is what it means — an external assistant weighing
// *"Goodreads says I read this in 2020"* against *"I read this and I remember it"* needs the
// sentence, not the slug.

/** One Provenance, with the sentence that says how much it is worth. */
export type Provenance = {
  /** The slug a Reading or a Rating carries: `remembered`, `goodreads-history`. */
  id: string;
  /** What the owner reads on screen. */
  name: string;
  /** How far this kind of record can be trusted, in the owner's words. */
  description: string;
};

/**
 * The Provenance of something the owner has just said, and the one slug this repo names.
 *
 * It is here rather than in the doors that need it, because *which Provenance a conversation
 * carries* is a statement about the model: the owner telling an assistant what they read is
 * the same first-hand evidence as typing it themselves, so it is `remembered` and not a
 * Provenance of its own. A door that wrote the slug itself would be a second place that
 * judgement lives — and there would be two of them, since both the Reading and the Rating
 * side of *"I finished volume 23, I'd give it an 8"* need it.
 *
 * The rest of the vocabulary is deliberately not named in TypeScript. Read it.
 */
export const FIRST_HAND = "remembered";

/** Every Provenance, in the order the model offers them. */
export async function listProvenances(): Promise<Provenance[]> {
  return query<Provenance>("select id, name, description from provenance order by display_order");
}
