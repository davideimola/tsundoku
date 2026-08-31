import { Client } from "pg";
import { requireDatabaseUrl } from "./env.ts";

// Proposals to look at a screen with, and **nothing else in the library**.
//
// The Inbox is the one screen that cannot be looked at with the real data, because the real
// data is that it is empty: an assistant has to have proposed something for there to be
// anything on it, and a maintenance session at the scale it is designed for (#27, ADR-0011)
// is a few hundred entries nobody wants to type by hand twice. So this writes some.
//
// **It writes to `inbox_entry` and to no other table, and that is the whole design.** A
// proposal is the one row in this schema that is not a fact about the library — it is
// something somebody said, waiting to be judged, and approving it is the act that makes it
// true. So inventing one lies about nothing and deleting it leaves no trace, which is exactly
// what a refreshable fixture needs to be.
//
// Everything else this library is short of is **the owner's own judgement** — 0 people and 0
// Credits, ten Readings all finished, nine Ratings — and this script deliberately does not
// invent any of it. A fabricated Rating is not test data: it is an opinion Davide never held,
// in a library kept for years, feeding a recommender he actually asks over MCP (ADR-0002).
// An empty *Reading now* band is the honest state of the library and the state the dashboard
// was designed against; the way to get a Reading is to record one on the Story screen, which
// takes one click and is true afterwards.
//
//   pnpm db:demo           refresh: drop what this file wrote before, write it again
//   pnpm db:demo --clean   drop what this file wrote, and write nothing
//
// **A refresh removes only its own rows.** The entries this file writes are identified by the
// sentences below, which are its own inventions, so a real proposal sitting in the Inbox from
// a real backfill is never touched by either command. That is the one property that makes it
// safe to run while a session is half done.
//
// The amendments name **real Volumes and real Series**, because the point of the screen is the
// diff — what stands in the record today beside what is proposed — and a made-up subject would
// show a made-up diff. Which means the ISBNs are invented numbers pointing at objects on
// Davide's actual shelf: they are here to be read and rejected, and approving one writes
// rubbish into the catalogue. The screen says as much; this says it too.

/**
 * What the assistant is made to have said, and the key to every row this file owns.
 *
 * Read as data rather than as prose: `--clean` deletes exactly the entries whose `reported`
 * is one of these, so a sentence removed from this list is a row that stops being cleaned up.
 * They are in Italian because `reported` is what the owner said, in the words they said it in.
 */
const SAID = {
  isbnFromTheCover: "letti dal retro di copertina, volume per volume",
  isbnFromTheShop: "letti dalla scheda del negozio online",
  theMustHaveLine: "la pagina Panini la elenca nella collana Marvel Must Have",
  countFromWikipedia: "su Wikipedia la serie è data a %d volumi usciti",
  aStoryWithNoType: "Ho letto Chainsaw Man, i primi undici volumi",
  aStoryComplete: "Sto leggendo Vinland Saga",
  aVolumeWithABadBinding: "Ho comprato Berserk Deluxe 3 in fumetteria",
  aSeriesWithAWordForACount: "Chainsaw Man esce in Italia per Planet Manga",
  aStoryThatWasRefused: "Ho letto un manga che si chiama Il Manga Inventato",
} as const;

/** Every sentence, with the count one filled in for each Series it is used for. */
function sentences(): string[] {
  const said = Object.values(SAID).filter((one) => !one.includes("%d"));
  return [...said, ...Object.values(OUT).map((out) => countOf(out))];
}

const countOf = (out: number) => SAID.countFromWikipedia.replace("%d", String(out));

/**
 * The two Series the import left at nought volumes published, and what they are really at.
 *
 * Real figures rather than invented ones: a published count is a fact about a publisher's
 * line, so there is no reason to make one up, and these two are the ledger this library has
 * actually fallen behind on.
 */
const OUT: Record<string, number> = { "Fullmetal Alchemist": 27, "One-Punch Man": 32 };

/**
 * How many ISBN amendments to write, per publisher's line.
 *
 * Two groups on purpose, and these two sizes on purpose: one folds shut when the screen
 * arrives, which is the decision *43 ISBNs on Star Comics Volumes* in miniature, and one
 * stays open, which is the row-by-row reading. A fixture with one group of six would leave
 * half the screen unexercised.
 */
const ISBNS: Record<string, number> = {
  "Panini Comics / Planet Manga": 6,
  "J-Pop Manga / Edizioni BD": 2,
};

/** A 13-digit ISBN that satisfies the Volume's own check constraint. Invented, obviously. */
const isbnFor = (at: number) => `978889${String(100000 + at * 7).slice(0, 6)}${at % 10}`;

async function main(): Promise<void> {
  const url = requireDatabaseUrl();

  // The one guard, and it is about the deployment rather than about mistakes: this writes
  // invented sentences into a database, and the production one is reachable from a laptop
  // with a port-forward (ADR-0003). A fixture that can be pointed at it is a fixture that
  // will be, once.
  const { hostname } = new URL(url);
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1") {
    throw new Error(
      `db/demo.ts writes invented proposals and refuses to leave this machine.\n` +
        `  DATABASE_URL points at ${hostname}, which is not localhost.`
    );
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      "delete from inbox_entry where reported = any($1::text[])",
      [sentences()]
    );
    const cleaning = process.argv.includes("--clean");
    process.stdout.write(`${rowCount ?? 0} demo entries removed\n`);
    if (cleaning) return;

    const written = await write(client);
    const [{ waiting }] = (
      await client.query<{ waiting: number }>(
        "select count(*)::int as waiting from inbox_entry where decided_at is null"
      )
    ).rows;

    process.stdout.write(
      `${written} demo entries written; ${waiting} waiting in the Inbox now.\n` +
        `Nothing is in the library: approving is the act that writes, and the ISBNs are invented.\n`
    );
  } finally {
    await client.end();
  }
}

/** Write the whole fixture, and say how many rows it was. */
async function write(client: Client): Promise<number> {
  let written = 0;

  /** One entry. `agoInMinutes` is what puts the Inbox in the order things arrived. */
  const propose = async (entry: {
    reported: string;
    act?: "create" | "amend";
    proposes: "story" | "volume" | "series";
    reference: string;
    subjectId?: string;
    details: Record<string, unknown>;
    agoInMinutes: number;
  }): Promise<void> => {
    await client.query(
      `insert into inbox_entry (reported, act, proposes, reference, subject_id, details, proposed_at)
       values ($1, $2, $3, $4, $5, $6, now() - ($7 || ' minutes')::interval)`,
      [
        entry.reported,
        entry.act ?? "create",
        entry.proposes,
        entry.reference,
        entry.subjectId ?? null,
        JSON.stringify(entry.details),
        entry.agoInMinutes,
      ]
    );
    written += 1;
  };

  // The backfill, on Volumes standing without an ISBN and **without a proposal already
  // waiting**: a real session may be half way through, and two amendments proposing an ISBN
  // for one Volume are indistinguishable in the diff.
  const { rows: volumes } = await client.query<{
    id: string;
    title: string;
    publisher: string;
  }>(
    `select id, title, publisher
       from volume
      where isbn is null
        and publisher = any($1::text[])
        and id not in (
              select subject_id from inbox_entry
               where subject_id is not null and decided_at is null)
      order by publisher, title`,
    [Object.keys(ISBNS)]
  );

  const taken = new Map<string, number>();
  let at = 0;
  for (const volume of volumes) {
    const room = ISBNS[volume.publisher] ?? 0;
    const already = taken.get(volume.publisher) ?? 0;
    if (already >= room) continue;
    taken.set(volume.publisher, already + 1);

    at += 1;
    await propose({
      reported: room > 3 ? SAID.isbnFromTheCover : SAID.isbnFromTheShop,
      act: "amend",
      proposes: "volume",
      reference: volume.title,
      subjectId: volume.id,
      details: { isbn: isbnFor(at) },
      agoInMinutes: 180 - already,
    });
  }

  // A second kind of amendment on the same kind of record: two fields at once, so the screen
  // has to say *3 publishers and edition lines* rather than *3 ISBNs*.
  const { rows: mustHave } = await client.query<{ id: string; title: string }>(
    `select id, title from volume
      where publisher like '%Must Have%' and edition_line is null
      order by title limit 3`
  );
  for (const volume of mustHave) {
    await propose({
      reported: SAID.theMustHaveLine,
      act: "amend",
      proposes: "volume",
      reference: volume.title,
      subjectId: volume.id,
      details: { publisher: "Panini Comics", editionLine: "Marvel Must Have" },
      agoInMinutes: 90,
    });
  }

  // The completeness ledger, which is the third kind of record an amendment reaches.
  const { rows: series } = await client.query<{ id: string; name: string }>(
    `select id, name from series where published_count = 0 and name = any($1::text[])`,
    [Object.keys(OUT)]
  );
  for (const line of series) {
    await propose({
      reported: countOf(OUT[line.name]),
      act: "amend",
      proposes: "series",
      reference: line.name,
      subjectId: line.id,
      details: { publishedCount: OUT[line.name] },
      agoInMinutes: 60,
    });
  }

  // And the other half of the boundary: records the library does not have at all, each one
  // arriving with the mistake an assistant actually makes.
  await propose({
    // No Type, so the box carries the `needed` mark and the approval is refused without it.
    reported: SAID.aStoryWithNoType,
    proposes: "story",
    reference: "Chainsaw Man",
    details: { title: "Chainsaw Man" },
    agoInMinutes: 40,
  });
  await propose({
    reported: SAID.aStoryComplete,
    proposes: "story",
    reference: "Vinland Saga",
    details: { title: "Vinland Saga", typeId: "manga" },
    agoInMinutes: 39,
  });
  await propose({
    // `cartonato` is not one of the seven Bindings: the field an assistant gets wrong most
    // often, and the reason the picker names the guess instead of defaulting quietly.
    reported: SAID.aVolumeWithABadBinding,
    proposes: "volume",
    reference: "Berserk Deluxe 3",
    details: {
      title: "Berserk Deluxe 3",
      publisher: "Panini Comics / Planet Manga",
      binding: "cartonato",
    },
    agoInMinutes: 20,
  });
  await propose({
    // A word where a number belongs. `details` is raw on purpose, so the owner sees what was
    // said rather than a silently dropped field.
    reported: SAID.aSeriesWithAWordForACount,
    proposes: "series",
    reference: "Chainsaw Man",
    details: { name: "Chainsaw Man", publisher: "Panini Comics", publishedCount: "diciassette" },
    agoInMinutes: 10,
  });

  // One already decided, because a rejection's whole effect is an absence and the decided
  // list is the only place the owner can see they said no to something.
  await client.query(
    `insert into inbox_entry (reported, proposes, reference, details, proposed_at, decided_at, outcome)
     values ($1, 'story', 'Il Manga Inventato', '{"title":"Il Manga Inventato"}',
             now() - interval '2 hours', now() - interval '1 hour', 'rejected')`,
    [SAID.aStoryThatWasRefused]
  );
  written += 1;

  return written;
}

await main();
