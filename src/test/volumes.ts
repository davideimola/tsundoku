import { acquireVolume, type CataloguedVolume, catalogueVolume } from "@/core/verbs/collection";

// One fixture, and it exists because of ADR-0007.
//
// Cataloguing an object and having it in the house are two acts and therefore two verbs,
// and most of Seam 1 wants both: a Series' ledger, a Story's carriers, an Edition note and
// the Collection itself are all questions about an object the owner *holds*. Saying both
// verbs in every fixture of every file would say nothing the tests are about, so the pair
// is named once here.
//
// A test may compose two verbs where an adapter may not (`src/core/verbs/README.md`): what
// that rule protects is a transaction the caller invented, and a fixture is not claiming
// one. Anything asserting *about* the split calls the two verbs itself — the point being
// tested is that they are two.

/**
 * Catalogue a Volume and acquire it, which is what "a Volume in the house" takes. Returns
 * its id.
 */
export async function volumeInTheHouse(
  volume: CataloguedVolume,
  acquisition: { acquiredOn?: string | null; pricePaid?: string | null } = {}
): Promise<string> {
  const { id } = await catalogueVolume(volume);
  await acquireVolume({ volumeId: id, ...acquisition });
  return id;
}
