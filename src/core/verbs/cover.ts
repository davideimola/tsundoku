import "server-only";

import {
  type AskForACover,
  type FoundCover,
  type StillThere,
  stillThere,
  theSources,
} from "../covers.ts";
import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";

// LOOKING UP A COVER, and putting the owner's own image over it (#32, ADR-0013).
//
// **Nothing on a page render calls a third party.** The lookup is a verb the owner runs; a
// render reads a column. That is the whole shape of this file, and it is what keeps the
// Collection wall answerable on a shop's signal — a wall that resolved 96 ISBNs against
// Google before it could paint would be a wall nobody opens in a shop.
//
// **This door is the owner's, and it is deliberately not the assistant's.** A cover is a
// field on a record that already exists, which ADR-0011 puts behind the Inbox — but an
// Amendment is a door for a *proposal*, and a lookup proposes nothing: it asks a source a
// question with an ISBN and writes down the answer. There is nothing for the owner to judge
// between the assistant's word and the record's, which is what an Amendment is for. So
// there is no `covers_look_up` tool on `/mcp`, and adding one would be a decision for an
// ADR rather than for a tool file (`src/lib/mcp/README.md`).

// A Volume's id is generated, so the owner never types one. A malformed one is therefore
// the same event as an unknown one, and this keeps it that way — `where id = $1` on a uuid
// column raises a syntax error for `"banana"`, which is not a refusal and reaches an adapter
// as a 500.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_SUCH_VOLUME = "No Volume has that id.";

/**
 * What one run of the lookup did. **Every object it touched is in exactly one of these
 * numbers**, which is what makes the report a thing the owner can read rather than a
 * headline with a remainder.
 */
export type CoverLookupReport = {
  /** Objects that had no cover and have one now. */
  found: number;
  /**
   * Objects the sources have no cover for. **An answer, and recorded as one** — whether it
   * is the first time this object was asked about or a jacket that has now been withdrawn.
   */
  absent: number;
  /**
   * Objects a source could not answer for — a rate limit, a timeout, an error page.
   *
   * **Nothing is recorded about the cover.** A 403 written down as an absence is the mistake
   * that produced a false 0% in the research this is built on, and the record would carry it
   * for as long as nobody looked again.
   */
  unanswered: number;
  /** Covers already recorded that were checked and are still there. */
  checked: number;
  /**
   * Covers that had gone and were **replaced** — the repair, rather than left broken on the
   * wall.
   *
   * One that had gone and has no replacement is an `absent`, not a half-counted repair: the
   * tile goes back to the drawn one, which is what the owner sees.
   */
  refreshed: number;
  /**
   * Objects with no ISBN, which were skipped rather than probed.
   *
   * Not a failure and not work left over: nothing keyed by an ISBN will ever find them.
   * Every Bonelli monthly is here for ever — those albi carry an ISSN-derived periodical
   * EAN and no ISBN at all — and what covers one is a photograph.
   */
  skipped: number;
  /**
   * Objects with an ISBN that **no lookup has ever reached** — what a second run starts
   * with, and the number that says whether running it again is worth anything.
   *
   * It is not the size of the gap: an object asked about and found to have no cover is not
   * waiting for anything, and counting it here would leave the owner running the lookup for
   * ever against a figure that never moves. `coverStanding` in `queries/cover.ts` is where
   * the gap itself is reported.
   */
  stillDue: number;
};

/** How a run is paced, and — in a test — who it asks. */
export type HowToLookUp = {
  /**
   * How many objects one run touches. Default 24.
   *
   * A run is a form post the owner waits on, so the batch is what keeps it a few seconds
   * rather than a few minutes. Running it again is the way to do the rest, and the report
   * says how many that is.
   */
  batch?: number;
  /**
   * Milliseconds between two requests to a source. Default 400.
   *
   * Google publishes no figure and warns instead that "*you may accidentally tip the
   * security precautions found in Google Books*"; Open Library publishes one and it is
   * 100 requests per IP per five minutes. Neither is troubled by this.
   */
  pace?: number;
  /**
   * Ask the sources again about objects that already carry a cover, instead of checking
   * that the cover is still there.
   *
   * **The escape hatch for a cover that is wrong rather than missing.** An ordinary run only
   * re-asks when the recorded address has *gone*, which is the right default: a live jacket
   * is nearly always the right jacket, and re-asking about ninety-six of them costs
   * ninety-six requests to somebody else's server. But a cover fetched against a *wrong
   * ISBN* is live and wrong, and nothing about it looks broken — *One-Punch Man 9* wearing
   * *Slam Dunk 9*'s jacket is the case this exists for. Correcting the ISBN unfaces the
   * object on its own (`amendVolume`); this is what re-faces a shelf of them.
   */
  again?: boolean;
  /** Who to ask. The sources, unless a test hands over its own. */
  ask?: AskForACover;
  /** How to tell whether a recorded cover is still there. The real `HEAD`, unless a test says. */
  verify?: StillThere;
};

const A_BATCH = 24;
const A_PACE = 400;

/** One object the run may have work to do about. */
type DueVolume = { id: string; isbn: string; coverUrl: string | null };

/**
 * Look up the covers of the objects that could have one, and record what was found **and
 * what was not**.
 *
 * A run draws from the Volumes carrying an ISBN, **least recently looked at first**, so a
 * first run is every object that has never been asked about and a later one rotates through
 * the rest. Two things happen to an object it reaches:
 *
 *   - it carries no cover, so a source is asked, and whatever comes back is written down —
 *     a cover, or an absence with the day it was established;
 *   - it carries one, so that URL is checked. Still there, and the check is recorded and
 *     nothing else changes. **Gone, and it is looked up again rather than left broken on the
 *     wall** — which is the lazy repair the design asks for, off the request path, because
 *     an `<img>` that 404s on a phone cannot write to a database and must not try.
 *
 * A Volume with **no ISBN is skipped rather than probed**, and the report says how many:
 * there is no question to ask about an object with no key, and a lookup that quietly
 * counted them as failures would read as a source getting worse every month.
 *
 * **This is the one verb in the repository that is not one transaction, and the reason is
 * the network.** A run is a sequence of independent facts about independent objects, each
 * written in a single statement; holding a transaction open across two dozen requests to
 * somebody else's CDN would put a lock behind a stranger's timeout, and losing twenty-three
 * good answers because the twenty-fourth hung is worse in every way than keeping them.
 */
export async function lookUpCovers(how: HowToLookUp = {}): Promise<CoverLookupReport> {
  const ask = how.ask ?? theSources;
  const verify = how.verify ?? stillThere;
  const pace = how.pace ?? A_PACE;
  const batch = Math.max(1, Math.trunc(how.batch ?? A_BATCH));

  const report: CoverLookupReport = {
    found: 0,
    absent: 0,
    unanswered: 0,
    checked: 0,
    refreshed: 0,
    skipped: await countWithoutAnIsbn(),
    stillDue: 0,
  };

  const due = await query<DueVolume>(
    `select v.id, v.isbn, v.cover_url as "coverUrl"
       from volume v
      where v.isbn is not null
      -- Never looked at first, then the oldest check. That is what makes one verb do both
      -- jobs: a library with no covers is a queue of first lookups, and a library with
      -- covers is a slow rotation over them looking for the ones that have gone.
      order by v.cover_looked_up_at asc nulls first, v.id
      limit $1`,
    [batch]
  );

  let asked = 0;
  for (const volume of due) {
    // Whether this object already carried a cover, which is what makes the answer below a
    // *repair* rather than a first answer — and they are counted apart, because every object
    // a run touches has to be in exactly one number for the report to be readable.
    const hadOne = volume.coverUrl !== null;

    if (volume.coverUrl && !how.again) {
      if (asked > 0) await breathe(pace);
      asked += 1;

      const state = await verify(volume.coverUrl);
      if (state !== "gone") {
        // **The moment is recorded either way, and that is deliberate.** `there` is a cover
        // confirmed; `unknown` is a check that could not be made — a refused `HEAD`, a 5xx,
        // a blip — and *nothing is written about the cover* in that case. But the check did
        // happen, and leaving the moment alone would hold this object at the head of a queue
        // ordered by it, burning a slot on every run for ever while the rest went unlooked at.
        await recordChecked(volume.id);
        if (state === "there") report.checked += 1;
        else report.unanswered += 1;
        continue;
      }
    }

    if (asked > 0) await breathe(pace);
    asked += 1;

    const answer = await ask(volume.isbn);

    if (answer.answer === "found") {
      await recordCover(volume.id, answer.cover);
      if (hadOne) report.refreshed += 1;
      else report.found += 1;
    } else if (answer.answer === "none") {
      await recordNoCover(volume.id);
      report.absent += 1;
    } else {
      // Nothing at all about the cover, and no moment either: an object nobody managed to
      // get an answer about is exactly the one a second run should ask about first.
      report.unanswered += 1;
    }
  }

  report.stillDue = await countStillDue();
  return report;
}

/** What looking one object up answered, for the screen that asked about one object. */
export type OneCoverLookedUp =
  | { outcome: "found"; cover: FoundCover }
  | { outcome: "none" }
  | { outcome: "unanswered"; because: string }
  | { outcome: "unchanged" };

/**
 * Look up **one** object's cover, from the page that is a record of that object — and
 * **always ask the source**, whatever is recorded here now.
 *
 * That is the difference between this and a run, and it is deliberate. A run is sweeping a
 * shelf, so it checks a recorded cover is still *there* and spends no request where it is; a
 * press on one object's own page is the owner saying *this one is wrong*, and the only cover
 * they cannot fix that way is the one this verb declined to re-ask about. The failure is
 * real and it is in production: a wrong ISBN fetched *Slam Dunk 9*'s jacket onto *One-Punch
 * Man 9*, the ISBN was corrected, and the jacket stayed — live, wrong, and passing every
 * check that asks whether an image still loads.
 *
 * So the four answers are about what the source said, not about what was skipped:
 * `unchanged` now means the source was asked and handed back the same address, which is
 * worth telling the owner because it means the ISBN, not the lookup, is what to look at
 * next.
 *
 * **A Volume with no ISBN is refused in prose rather than probed**, because on one object
 * the owner is owed the reason: nothing keyed by an ISBN can find this, and the answer is a
 * photograph.
 */
export async function lookUpCoverFor(
  volumeId: string,
  how: HowToLookUp = {}
): Promise<OneCoverLookedUp> {
  if (!UUID.test(volumeId)) throw new Refusal("not-found", NO_SUCH_VOLUME);

  const [volume] = await query<{ id: string; isbn: string | null; coverUrl: string | null }>(
    `select v.id, v.isbn, v.cover_url as "coverUrl" from volume v where v.id = $1`,
    [volumeId]
  );

  if (!volume) throw new Refusal("not-found", NO_SUCH_VOLUME);
  if (!volume.isbn) {
    throw new Refusal(
      "not-allowed",
      "That Volume has no ISBN, and every source is keyed by one. Record its ISBN, or give it an image of your own."
    );
  }

  const answer = await (how.ask ?? theSources)(volume.isbn);

  if (answer.answer === "found") {
    await recordCover(volume.id, answer.cover);
    return answer.cover.url === volume.coverUrl
      ? { outcome: "unchanged" }
      : { outcome: "found", cover: answer.cover };
  }
  if (answer.answer === "none") {
    await recordNoCover(volume.id);
    return { outcome: "none" };
  }
  return { outcome: "unanswered", because: answer.because };
}

/**
 * Take the looked-up cover off an object: the tile goes back to the drawn one, and nothing
 * is claimed about the book until a lookup asks again.
 *
 * **A blank tile is better than a wrong one**, and that is the whole argument for the verb.
 * *One-Punch Man 9* wearing *Slam Dunk 9*'s jacket is not a gap in the library, it is the
 * library lying, and the owner should not have to wait on Google to stop it. Correcting a
 * wrong ISBN does this on its own (`amendVolume`); this is what does it when the ISBN was
 * already right and the jacket is somebody else's anyway.
 *
 * It leaves the owner's own image alone — that was never an answer to an ISBN — and it
 * leaves nothing behind that would stop a later run asking again.
 */
export async function forgetTheCover(volumeId: string): Promise<void> {
  if (!UUID.test(volumeId)) throw new Refusal("not-found", NO_SUCH_VOLUME);

  const [outcome] = await query<{ known: boolean; forgotten: boolean }>(
    `with known as (select id from volume where id = $1),
          gone as (update volume
                      set cover_source = null, cover_reference = null, cover_url = null,
                          cover_info_url = null, cover_looked_up_at = null
                    where id = $1 and cover_url is not null
                returning id)
     select exists (select 1 from known) as known,
            exists (select 1 from gone)  as forgotten`,
    [volumeId]
  );

  if (!outcome.known) throw new Refusal("not-found", NO_SUCH_VOLUME);
  if (!outcome.forgotten) {
    throw new Refusal("not-allowed", "That Volume carries no looked-up cover to forget.");
  }
}

/**
 * Put the owner's own image on an object: a photograph, or a scan. It **overrides** whatever
 * the lookup found, and nothing takes it off but the owner.
 *
 * This is the escape hatch ADR-0013 reserves hosting for. The image is the owner's, no third
 * party's terms reach it, and it is the only thing that will ever cover a Bonelli monthly —
 * so the database refuses one served from a source's own domain, which would be somebody
 * else's bytes claimed as the owner's rather than an image they made.
 */
export async function setOwnCover(volumeId: string, imageUrl: string): Promise<void> {
  if (!UUID.test(volumeId)) throw new Refusal("not-found", NO_SUCH_VOLUME);

  const changed = await refusing(
    () =>
      query<{ id: string }>(`update volume set own_image_url = $2 where id = $1 returning id`, [
        volumeId,
        imageUrl,
      ]),
    (constraint) =>
      constraint === "volume_own_image_is_the_owners_own"
        ? "An image of your own is an https address of your own. A cover on Google's or Open Library's domain is theirs, and this app only points at those."
        : "That image could not be put on the Volume."
  );

  if (changed.length === 0) throw new Refusal("not-found", NO_SUCH_VOLUME);
}

/**
 * Take the owner's own image back off: the object goes back to whatever the lookup found,
 * or to the drawn tile where it found nothing.
 *
 * It leaves the looked-up cover exactly where it was, because the two are different facts —
 * one about the record, one about the object — and removing a photograph is not saying
 * anything about what Google holds.
 */
export async function dropOwnCover(volumeId: string): Promise<void> {
  if (!UUID.test(volumeId)) throw new Refusal("not-found", NO_SUCH_VOLUME);

  const [outcome] = await query<{ known: boolean; dropped: boolean }>(
    `with known as (select id from volume where id = $1),
          gone as (update volume set own_image_url = null
                    where id = $1 and own_image_url is not null
                returning id)
     select exists (select 1 from known) as known,
            exists (select 1 from gone)  as dropped`,
    [volumeId]
  );

  if (!outcome.known) throw new Refusal("not-found", NO_SUCH_VOLUME);
  if (!outcome.dropped) {
    throw new Refusal("not-allowed", "That Volume carries no image of your own.");
  }
}

/** Write down a cover, and the moment it was established. One statement, one object. */
async function recordCover(volumeId: string, cover: FoundCover): Promise<void> {
  await refusing(
    () =>
      query(
        `update volume
            set cover_source       = $2,
                cover_reference    = $3,
                cover_url          = $4,
                cover_info_url     = $5,
                cover_looked_up_at = now()
          where id = $1`,
        [volumeId, cover.source, cover.reference, cover.url, cover.infoUrl]
      ),
    (constraint) =>
      constraint === "volume_cover_is_hotlinked_and_never_hosted"
        ? "A cover is pointed at where it lives and never copied here (ADR-0013), and that address is somewhere else."
        : "That cover could not be recorded."
  );
}

/**
 * Write down that there is no cover: the fields are cleared and the moment is kept.
 *
 * **The moment is the whole point.** Without it *we asked and there is none* and *nobody has
 * ever asked* are the same row, and a screen could only ever report the second one.
 */
async function recordNoCover(volumeId: string): Promise<void> {
  await query(
    `update volume
        set cover_source       = null,
            cover_reference    = null,
            cover_url          = null,
            cover_info_url     = null,
            cover_looked_up_at = now()
      where id = $1`,
    [volumeId]
  );
}

/** The cover is still there: nothing about it changed but when it was last looked at. */
async function recordChecked(volumeId: string): Promise<void> {
  await query(`update volume set cover_looked_up_at = now() where id = $1`, [volumeId]);
}

async function countWithoutAnIsbn(): Promise<number> {
  const [row] = await query<{ count: string }>(
    `select count(*) as count from volume where isbn is null`
  );
  return Number(row.count);
}

/** How many objects with an ISBN nobody has asked a source about yet. */
async function countStillDue(): Promise<number> {
  const [row] = await query<{ count: string }>(
    `select count(*) as count
       from volume
      where isbn is not null and cover_url is null and cover_looked_up_at is null`
  );
  return Number(row.count);
}

/** Wait, between two requests to somebody else's server. */
function breathe(pace: number): Promise<void> {
  if (pace <= 0) return Promise.resolve();
  return new Promise((wake) => setTimeout(wake, pace));
}
