import { Client } from "pg";
import { requireDatabaseUrl } from "./env.ts";

// A library invented to be walked through, and **it is not the owner's library**.
//
// `db/demo.ts` is the fixture beside this one and it writes to `inbox_entry` and nowhere else,
// on a rule worth repeating here: a fabricated Rating is not test data, it is an opinion the
// owner never held, and this application feeds a recommender they actually ask (ADR-0002). That
// rule is why demo data stops at the Inbox.
//
// This file deliberately goes further, and the reason it is allowed to is that it is **only ever
// pointed at a database nobody keeps**. It writes Stories, Volumes, Passes, Ratings, Wants and a
// Path, because the thing it exists to make walkable — a videogame standing beside a manga on one
// Pile (#55) — cannot be seen at all until something stands there. What it must never do is leave
// a mark on a library somebody uses, so it holds two guards rather than one:
//
//   - it refuses any host that is not this machine, exactly as `db/demo.ts` does; and
//   - **every row it writes carries an id beginning `d0d0`**, which is what `--clean` deletes and
//     the only thing it deletes. A row the owner typed is never touched by either command.
//
// The titles are real because a screen full of *Lorem Ipsum 3* tells you nothing about whether a
// tile reads well. The **judgements are not**: every score below is invented, and the two Credits
// are attributed to a person who does not exist, on two works that do not exist, precisely so that
// no real author is credited here with something they did not do.
//
//   pnpm db:mock           write it, replacing whatever it wrote before
//   pnpm db:mock --clean   remove it, and write nothing
//
// It is re-runnable: it removes its own rows first, so running it twice leaves the same library
// rather than two of it.

/**
 * The mark every row this file owns carries, and the whole of its cleanup contract.
 *
 * An id is the key rather than a title, because a title is something the owner might also type
 * and an id in this range is not. Sixteen bytes of which four are a signature: `d0d0` names the
 * fixture, the next four name what kind of record it is, and the tail counts.
 */
const MARK = "d0d0";

/** An id in the fixture's own range: `d0d0<kind>-0000-4000-8000-<counted>`. */
const id = (kind: string, at: number) =>
  `${MARK}${kind}-0000-4000-8000-${String(at).padStart(12, "0")}`;

const story = (at: number) => id("5709", at); // "stor"
const volume = (at: number) => id("0701", at); // "vol"
const line = (at: number) => id("5e21", at); // "seri"
const pass = (at: number) => id("9455", at); // "pass"
const score = (at: number) => id("4a71", at); // a judgement
const want = (at: number) => id("aa17", at);
const route = (at: number) => id("40a7", at); // "path"
const who = (at: number) => id("9e05", at); // "peop"
const credit = (at: number) => id("c4ed", at);
const bought = (at: number) => id("acc0", at);

/**
 * The image a Story wears when the owner has given it one (#65).
 *
 * A placeholder service rather than a photograph, because the fixture cannot ship bytes and a
 * dead URL would show the one thing this row exists to disprove — a broken tile. It satisfies the
 * constraint for the reason every hosted image does: it is https and it is neither of the two
 * sources this app looks covers up from.
 */
const AN_IMAGE_OF_MY_OWN =
  "https://placehold.co/420x594/2b2118/f5efe6/png?text=Expedition+33&font=lora";

async function main(): Promise<void> {
  const url = requireDatabaseUrl();

  // The same guard `db/demo.ts` states, and for the same reason: the production database is
  // reachable from a laptop with a port-forward (ADR-0003), so a fixture that can be pointed at
  // it is one that will be, once. This one writes far more than proposals, so the guard matters
  // more here than there.
  const { hostname } = new URL(url);
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1") {
    throw new Error(
      `db/mock.ts writes an invented library and refuses to leave this machine.\n` +
        `  DATABASE_URL points at ${hostname}, which is not localhost.`
    );
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    // One transaction around both halves, so a fixture that fails cannot leave a half-written
    // library behind — the state this file was in the first time it ran, which is how the guard
    // got here. Either the whole invented library stands or none of it does.
    await client.query("begin");
    const removed = await clean(client);
    if (process.argv.includes("--clean")) {
      await client.query("commit");
      process.stdout.write(`${removed} mock rows removed\n`);
      return;
    }

    const written = await write(client);
    await client.query("commit");
    process.stdout.write(`${removed} mock rows removed\n`);
    process.stdout.write(
      `${written} mock rows written.\n` +
        "Every one of them is invented, and `pnpm db:mock --clean` takes them all back off.\n" +
        "Look at /pile, /stories?type=videogame and the game's own page.\n"
    );
  } finally {
    await client.end();
  }
}

/**
 * Delete exactly what this file wrote, in an order the foreign keys allow.
 *
 * Children before parents, and each one keyed off the mark rather than off a join, so a row this
 * fixture never wrote cannot be reached from here however the library has been edited since.
 */
async function clean(client: Client): Promise<number> {
  const mine = `${MARK}%`;
  const byOwnId = [
    "rating",
    "want",
    "credit",
    "acquisition",
    "pass",
    "volume",
    "story",
    "path",
    "series",
    "person",
  ];
  const byParent: Array<[string, string]> = [
    ["pile_pin", "story_id"],
    ["path_item", "path_id"],
    ["volume_story", "volume_id"],
  ];

  let removed = 0;
  for (const [table, column] of byParent) {
    const { rowCount } = await client.query(`delete from ${table} where ${column}::text like $1`, [
      mine,
    ]);
    removed += rowCount ?? 0;
  }
  for (const table of byOwnId) {
    const { rowCount } = await client.query(`delete from ${table} where id::text like $1`, [mine]);
    removed += rowCount ?? 0;
  }
  return removed;
}

/** Write the whole fixture, and say how many rows it was. */
async function write(client: Client): Promise<number> {
  let written = 0;
  const run = async (sql: string, values: unknown[] = []) => {
    const { rowCount } = await client.query(sql, values);
    written += rowCount ?? 0;
  };

  // ── The games ───────────────────────────────────────────────────────────────────────────
  //
  // Eight Stories of Type Videogame, and between them they cover every shape a Pass has: one
  // gone through twice on two different consoles, one still under way, one abandoned, one
  // wanted and never played, three on a route, and one that holds no story at all.
  await run(
    `insert into story (id, title, type_id) values
       ($1,  'Hades',                       'videogame'),
       ($2,  'Clair Obscur: Expedition 33', 'videogame'),
       ($3,  'Disco Elysium',               'videogame'),
       ($4,  'Hollow Knight: Silksong',     'videogame'),
       ($5,  'Dark Souls',                  'videogame'),
       ($6,  'Dark Souls II',               'videogame'),
       ($7,  'Dark Souls III',              'videogame'),
       ($8,  'Tetris',                      'videogame')`,
    [story(1), story(2), story(3), story(4), story(5), story(6), story(7), story(8)]
  );

  // The one image in the fixture, on the game that has the most reason to want one: nothing
  // carries it, so without this it draws the tint, which is the ordinary case sitting beside it
  // on every other row (#65).
  await run(`update story set own_image_url = $2 where id = $1`, [story(2), AN_IMAGE_OF_MY_OWN]);

  // ── The books, for the contrast ─────────────────────────────────────────────────────────
  //
  // A game is only interesting on a Pile that also holds paper, because the promise the Pile
  // makes — *what does it take to start this tonight* — is answered differently by the two.
  await run(
    `insert into story (id, title, type_id, instalments, instalments_said_by) values
       ($1, 'Vagabond',    'manga', 37, 'line'),
       ($2, 'Neuromancer', 'novel', null, null)`,
    [story(20), story(21)]
  );
  await run(
    `insert into series (id, name, publisher, edition_line, published_count, status, story_id)
     values ($1, 'Vagabond', 'Planet Manga', 'Deluxe', 37, 'concluded', $2)`,
    [line(1), story(20)]
  );
  await run(
    `insert into volume (id, title, publisher, edition_line, binding_id, language, series_id, series_number)
     values ($1, 'Vagabond Deluxe 1', 'Planet Manga', 'Deluxe', 'deluxe', 'it', $3, 1),
            ($2, 'Vagabond Deluxe 2', 'Planet Manga', 'Deluxe', 'deluxe', 'it', $3, 2)`,
    [volume(1), volume(2), line(1)]
  );
  await run(
    `insert into volume_story (volume_id, story_id, covers_from, covers_to)
     values ($1, $3, 1, 3), ($2, $3, 4, 6)`,
    [volume(1), volume(2), story(20)]
  );
  // One is in the house and one is only catalogued, which is the distinction the Collection is
  // built on — and on the Pile it is the difference between *on the shelf* and *buy it first*.
  await run(
    `insert into acquisition (id, volume_id, acquired_on, price_paid)
     values ($1, $2, current_date - 400, 14.90)`,
    [bought(1), volume(1)]
  );

  // ── The passes ──────────────────────────────────────────────────────────────────────────
  //
  // Twice through one Story on two consoles, which is the case ADR-0021 names: changing
  // hardware does not mint a second work.
  await run(
    `insert into pass (id, story_id, medium, outcome, started_on, ended_on, provenance_id) values
       ($1, $9,  'nintendo-switch', 'finished',  current_date - 700, current_date - 660, 'remembered'),
       ($2, $9,  'pc',              'finished',  current_date - 120, current_date - 100, 'remembered'),
       ($3, $10, 'playstation-5',   null,        current_date - 12,  null,               'remembered'),
       ($4, $11, 'pc',              'abandoned', current_date - 300, current_date - 280, 'remembered'),
       ($5, $12, 'playstation-5',   'finished',  current_date - 900, current_date - 830, 'remembered'),
       ($6, $13, 'nintendo-switch', 'finished',  current_date - 2000, current_date - 1900, 'remembered'),
       ($7, $14, 'paper',           null,        current_date - 500, null,               'typed-from-the-shelf'),
       ($8, $15, 'digital',         'finished',  current_date - 60,  current_date - 40,  'goodreads-history')`,
    [
      pass(1),
      pass(2),
      pass(3),
      pass(4),
      pass(5),
      pass(6),
      pass(7),
      pass(8),
      story(1),
      story(2),
      story(3),
      story(5),
      story(8),
      story(20),
      story(21),
    ]
  );
  // The paper one went through the object that is in the house, which is the only medium that
  // may (#61). It has not ended, which is what makes it a run the owner is in the middle of —
  // the source that puts a book on the Pile beside the games, saying *3 of 37* and *on the
  // shelf* where a game says *tonight*.
  await run(`update pass set volume_id = $2, at_instalment = 3 where id = $1`, [
    pass(7),
    volume(1),
  ]);

  // ── The judgements ──────────────────────────────────────────────────────────────────────
  //
  // Invented, and on the same 1-to-10 scale a manga takes — coarse where the owner would only
  // have meant *liked it*, half points where they would have meant more (ADR-0008).
  await run(
    `insert into rating (id, story_id, pass_id, score, scale, prose, provenance_id) values
       ($1, $5,  $8,  9,   'half-points', 'The one that made me finish a run twice.', 'remembered'),
       ($2, $6,  $9,  6.5, 'half-points', 'Put it down and never wanted it back.',    'remembered'),
       ($3, $7,  $10, 8,   'coarse',      null,                                       'remembered'),
       ($4, $11, $12, 8,   'coarse',      null,                                       'goodreads-history')`,
    [
      score(1),
      score(2),
      score(3),
      score(4),
      story(1),
      story(3),
      story(8),
      pass(1),
      pass(4),
      pass(6),
      story(21),
      pass(8),
    ]
  );

  // ── What is still ahead ─────────────────────────────────────────────────────────────────
  //
  // A Want is a fact, and the two here are the two cases worth telling apart. One is on a game
  // nothing has gone through, which is the ordinary way something reaches the Pile. The other is
  // on a game finished years ago and opened today — meaning to play something *again* — and it
  // stands rather than falling quiet, because what silences a Want is a Pass later than it.
  await run(`insert into want (id, story_id) values ($1, $3), ($2, $4)`, [
    want(1),
    want(2),
    story(4),
    story(8),
  ]);

  // A saga held together, and holding it together puts nothing on the Pile by itself — the Path
  // being active is what does that.
  await run(
    `insert into path (id, name, intent, active)
     values ($1, 'I tre Dark Souls', 'finirli in ordine, uno alla volta', true)`,
    [route(1)]
  );
  await run(
    `insert into path_item (path_id, story_id, position)
     values ($1, $2, 1), ($1, $3, 2), ($1, $4, 3)`,
    [route(1), story(5), story(6), story(7)]
  );

  // The head of the Pile: one thing decided on, standing above a list that promises no order.
  await run(`insert into pile_pin (story_id) values ($1)`, [story(4)]);

  // ── Who made what ───────────────────────────────────────────────────────────────────────
  //
  // **Two works that do not exist, credited to a person who does not exist**, and that is the
  // point rather than a shortcut: the claim worth walking is that a person credited on a game
  // and on a manga is *one* person, and demonstrating it on real titles would mean attributing
  // real work to somebody who did not do it.
  await run(
    `insert into story (id, title, type_id) values ($1, 'Il Gioco Inventato', 'videogame'), ($2, 'Il Manga Inventato', 'manga')`,
    [story(30), story(31)]
  );
  await run(`insert into person (id, name) values ($1, 'Ada Finzione')`, [who(1)]);
  await run(
    `insert into credit (id, story_id, person_id, role_id) values
       ($1, $4, $6, 'director'),
       ($2, $4, $6, 'composer'),
       ($3, $5, $6, 'writer')`,
    [credit(1), credit(2), credit(3), story(30), story(31), who(1)]
  );

  return written;
}

await main();
