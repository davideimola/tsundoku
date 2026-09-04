// The counts the database has to agree with before this transaction may commit.
//
// The parent import wrote the rule this file inherits: **nothing here can see the plan.**
// An expectation whose number is the length of an array that the write then inserts row for
// row is a tautology — it cannot fail, and a run full of green tautologies reads exactly
// like a run that checked something. So every number below is arithmetic over two things
// and nothing else:
//
//   counted   how many cells the translation read, incremented one at a time as it read
//   before    what the database already held, read inside the same transaction
//
// The second one is new here, and it is what makes an import into a **library that is
// already there** checkable at all. The parent import asserts against an empty database,
// so its numbers are the tab's counts outright; this one asserts against the comics half —
// forty-two Stories, ninety-nine Volumes, and a shelf of acquisitions that must come out
// the other side untouched. `story = 42 + 54` is a real assertion, and it fails if this
// import writes a fifty-fifth or eats one of the forty-two.

/** A count the database has to agree with, and where the number came from. */
export type Expectation = {
  readonly what: string;
  readonly sql: string;
  readonly expected: number;
  readonly from: string;
};

/**
 * What the translation counts as it reads.
 *
 * A mutable object rather than a tally of string keys, because there is one tab and eight
 * numbers: a class the type checker knows the fields of catches the drift that the parent
 * import's `TALLY` constants catch by convention.
 */
export class Counted {
  /** Rows that said something. A blank spacer row is not one. */
  rows = 0;
  /** Rows saying `Posseduto`. */
  owned = 0;
  /** Owned rows the sheet describes an object from: a publisher and a binding. */
  describable = 0;
  /** Owned rows it does not, which get a Story and no Volume. */
  undescribable = 0;
  /** Rows whose `Stato` says an act of reading happened. */
  read = 0;
  /** Rows that are a paper pass **through an object the house holds**. */
  readThroughOwn = 0;
  /** Rows carrying a `Voto`. */
  rated = 0;
  /** Names read out of an `Autore/i` cell. */
  creditNames = 0;
  /** Names repeating a person's role on one Story. */
  creditRepeats = 0;
  /** Rows whose `Categoria` is a script. */
  plays = 0;
}

/** What the database held before this transaction wrote anything. */
export type Before = {
  readonly story: number;
  readonly volume: number;
  readonly acquisition: number;
  readonly volumeStory: number;
  readonly reading: number;
  readonly rating: number;
  readonly credit: number;
  readonly readingsThroughAVolume: number;
  readonly plays: number;
  readonly volumesWithNoOpenAcquisition: number;
};

/** The `before` counts, as SQL, so the write reads them the same way twice. */
export const BEFORE: Readonly<Record<keyof Before, string>> = {
  story: "select count(*) from story",
  volume: "select count(*) from volume",
  acquisition: "select count(*) from acquisition",
  volumeStory: "select count(*) from volume_story",
  reading: "select count(*) from reading",
  rating: "select count(*) from rating",
  credit: "select count(*) from credit",
  readingsThroughAVolume: "select count(*) from reading where volume_id is not null",
  plays: "select count(*) from story where type_id = 'play'",
  volumesWithNoOpenAcquisition:
    "select count(*) from volume v where not exists (" +
    "select 1 from acquisition a where a.volume_id = v.id and a.released_on is null)",
};

/**
 * Every check this import has to pass, and the sentence that says where each number is
 * from.
 *
 * `names` is the people the tab credits, folded and de-duplicated. It is passed in rather
 * than counted here for one reason: the check it feeds asks the database how many of those
 * names it can find, and a name the comics half already knows must not be double-counted
 * on either side of the equals sign.
 */
export function expectationsFor(
  counted: Counted,
  before: Before,
  names: readonly string[]
): readonly Expectation[] {
  const literal = (name: string) => `'${name.replace(/'/g, "''")}'`;
  const nameList = names.length === 0 ? "null" : names.map(literal).join(", ");

  return [
    {
      what: "one Story per row the tab said something on, and not one of the comics half touched",
      sql: BEFORE.story,
      expected: before.story + counted.rows,
      from: `${before.story} already in the library + ${counted.rows} rows read`,
    },
    {
      what: "one Volume per owned row the sheet can describe an object from",
      sql: BEFORE.volume,
      expected: before.volume + counted.describable,
      from:
        `${before.volume} already catalogued + ${counted.describable} of ${counted.owned} owned rows ` +
        `describable (${counted.undescribable} said no publisher or no binding)`,
    },
    {
      what: "an open acquisition for every Volume this import catalogued — being owned is the second act",
      sql: BEFORE.acquisition,
      expected: before.acquisition + counted.describable,
      from: `${before.acquisition} already recorded + ${counted.describable} objects put in the house`,
    },
    {
      what: "every new object carries the narrative its row named",
      sql: BEFORE.volumeStory,
      expected: before.volumeStory + counted.describable,
      from: `${before.volumeStory} already said + ${counted.describable} objects, one Story each`,
    },
    {
      what: "one Reading per row whose Stato says an act of reading happened",
      sql: BEFORE.reading,
      expected: before.reading + counted.read,
      from: `${before.reading} already recorded + ${counted.read} rows saying the book was read`,
    },
    {
      what: "one Rating per row carrying a Voto",
      sql: BEFORE.rating,
      expected: before.rating + counted.rated,
      from: `${before.rating} already given + ${counted.rated} rows with a Voto`,
    },
    {
      what: "one Credit per name, and a name said twice on one Story said once here",
      sql: BEFORE.credit,
      expected: before.credit + counted.creditNames - counted.creditRepeats,
      from:
        `${before.credit} already attributed + ${counted.creditNames} names read ` +
        `- ${counted.creditRepeats} repeating a role on one Story`,
    },
    {
      what: "a paper pass through an object the house holds went through that object",
      sql: BEFORE.readingsThroughAVolume,
      expected: before.readingsThroughAVolume + counted.readThroughOwn,
      from:
        `${before.readingsThroughAVolume} already through a Volume + ${counted.readThroughOwn} ` +
        "rows both owned, read and on paper",
    },
    {
      what: "the script is a script",
      sql: BEFORE.plays,
      expected: before.plays + counted.plays,
      from: `${before.plays} already + ${counted.plays} rows whose Categoria is Teatro`,
    },
    {
      what: "no Volume was left out of the house — and none the comics half holds was taken out of it",
      sql: BEFORE.volumesWithNoOpenAcquisition,
      expected: before.volumesWithNoOpenAcquisition,
      from:
        `${before.volumesWithNoOpenAcquisition} before, and this import adds none: every ` +
        "Volume it writes is on the shelf, because `Posseduto` is the only reason it writes one",
    },
    {
      what: "every person the tab credits is in the library exactly once, whoever first named them",
      sql: `select count(*) from person where lower(name) in (${nameList})`,
      expected: names.length,
      from: `${names.length} distinct names in the Autore/i column, matched on lower(name) as the unique index does`,
    },
    {
      what: "no digital pass went through an object",
      sql: "select count(*) from reading where volume_id is not null and medium <> 'paper'",
      expected: 0,
      from: "digital ownership is deliberately not modelled, and Postgres refuses this row too",
    },
  ];
}
