// THE COLLECTION AS THE SHELF AT HOME: the Volumes the wall's query hands over, stood the way
// they stand in the house — **one shelf per Series**, its objects in order, and the objects that
// belong to no Series together after them, *on their own*.
//
// The Stories wall is the diary and says what the owner did with a narrative; this one says only
// what an object is. So the grouping is by the object's own Series and nothing about reading
// enters it. The order inside and between the shelves is the core's (`listCollectionWall`, which
// already stands a run together by its number); this only cuts it. Tested beside itself under
// the licence `vitest.config.ts` states: data in, data out.

/**
 * How the shelves are drawn: as covers, or as spines standing side by side. **In the URL**
 * (`?view=spines`), so it survives a refresh and needs no script (ADR-0010). Covers are the
 * default and are not written into the address.
 */
export const VIEWS = ["covers", "spines"] as const;
export type View = (typeof VIEWS)[number];

/** The view the address asks for, read against the list rather than trusted. */
export function viewAsked(said: string | undefined): View {
  return VIEWS.find((one) => one === said) ?? "covers";
}

/** What a Volume has to answer to be stood on a shelf. */
type Shelvable = { series: { id: string } | null };

/** One Series' shelf: the Series, and its objects in the house, in the order they came. */
export type SeriesShelf<Volume extends Shelvable> = {
  series: NonNullable<Volume["series"]>;
  volumes: Volume[];
};

/**
 * The wall cut into shelves: every Series in the order its first object came, each holding its
 * objects in the order they came, and the objects in no Series apart, in the order they came.
 */
export function shelvesOf<Volume extends Shelvable>(
  volumes: readonly Volume[]
): { runs: SeriesShelf<Volume>[]; onTheirOwn: Volume[] } {
  const runs = new Map<string, SeriesShelf<Volume>>();
  const onTheirOwn: Volume[] = [];

  for (const volume of volumes) {
    const series = volume.series as NonNullable<Volume["series"]> | null;
    if (series === null) {
      onTheirOwn.push(volume);
      continue;
    }

    const shelf = runs.get(series.id);
    if (shelf) shelf.volumes.push(volume);
    else runs.set(series.id, { series, volumes: [volume] });
  }

  return { runs: [...runs.values()], onTheirOwn };
}

/**
 * The Binding a whole shelf shares, said once beside its name — or `null` where its objects are
 * bound more than one way, and each says its own.
 */
export function theBindingItShares(
  volumes: readonly { binding: { id: string; name: string } }[]
): string | null {
  const [first, ...rest] = volumes;
  if (!first) return null;
  return rest.every((one) => one.binding.id === first.binding.id) ? first.binding.name : null;
}

/**
 * How much of the line is in the house, as the Series page says it: *22 of 30 in the house*,
 * and the share the gilt bar is filled to. Where nobody has recorded how many are out there is
 * no denominator to invent, so it is the count alone and no bar.
 */
export function inTheHouse(ledger: { ownedCount: number; publishedCount: number }): {
  said: string;
  share: number | null;
} {
  if (ledger.publishedCount <= 0) {
    return { said: `${ledger.ownedCount} in the house`, share: null };
  }

  return {
    said: `${ledger.ownedCount} of ${ledger.publishedCount} in the house`,
    share: Math.min(1, ledger.ownedCount / ledger.publishedCount),
  };
}
