import "server-only";

// WHAT A BOOK IS, ASKED BY ISBN — and the **second** file in this repository that knows what
// a `fetch` is. `covers.ts` was the first and said it was the only one; that sentence is now
// a list of two, and this is the argument for the second entry, written here rather than left
// for the wall to state (`src/app/hotlinked.test.ts`).
//
// **They are two subjects, not one file split in half.** `covers.ts` answers *what does this
// object look like* and its whole design is about bytes that are somebody else's: hotlinked,
// 128 pixels, revocable, forbidden to keep (ADR-0013). This answers *what is this object* —
// a title and a publisher, which are facts rather than property, and which the owner is about
// to type into a form either way. Nothing here is hotlinked and nothing here is a permanent
// copy of anybody's content: what comes back is written into the fields of a form the owner
// then reads, corrects and submits.
//
// **The source is SBN, and it is chosen because it is the one that has manga.** The cover
// research (`docs/research/cover-images-by-isbn.md`) measured the alternatives on 54 real
// Italian-market ISBNs:
//
//   Google Books v1  a bibliographic record for 52/54 (96%) — and **keyless it answers 429
//                    with `"quota_limit_value": "0"`**. It needs a Google Cloud project and a
//                    key, which is a credential this app does not have and a deploy-time
//                    dependency it does not want. Dynamic Links, the keyless path the covers
//                    use, carries no title at all: it is a viewability endpoint.
//   Open Library     no record whatsoever for 51/54, and **zero manga from any publisher**.
//                    Keyless and generous, and empty for this library's shelf.
//   SBN / ICCU       Italy's legal-deposit catalogue, keyless, and it has the manga: probed
//                    again on 2026-09-01, `9788822632753` answers *One piece 100*, Star
//                    Comics, 2022. §5 of the research is how the endpoint was found.
//
// **What it costs is stated rather than discovered**: this is the site's own XHR surface, not
// a published contract. It is undocumented, it is unsupported, and during the session that
// measured it it returned 502 and then 503 for extended stretches while the homepage still
// served 200. Which is why the answer here has three cases and not two, exactly as a cover's
// does — a backend that is down is **unanswered**, never *no such book*. A false "SBN has
// never heard of this ISBN", read by the owner standing in a shop, is the cover research's
// false 0% happening a second time in a place where it changes a decision.

/** What a source says an object is: the two fields the owner would otherwise type. */
export type BookRecord = {
  /**
   * What the object is called, as a shelf calls it — *One piece 100*. A librarian's field
   * carries more than that (a uniform title in braces, a chapter's own name after a colon, a
   * statement of responsibility after a slash) and `theTitleItIs` is what keeps only the part
   * this library's Title field means.
   */
  readonly title: string;
  /** The publisher, out of the imprint line. `null` where none could be read. */
  readonly publisher: string | null;
};

/**
 * What a source said. **Three answers and not two**, and the third is the one that matters:
 * a source that could not be asked is not a source saying the book does not exist.
 */
export type RecordAnswer =
  | { readonly answer: "found"; readonly record: BookRecord }
  | { readonly answer: "none" }
  | { readonly answer: "unanswered"; readonly because: string };

/** Ask one ISBN's record. The query takes one of these, so a test needs no network. */
export type AskAboutAnIsbn = (isbn: string) => Promise<RecordAnswer>;

// The search endpoint, and the three parameters that make it a search *by ISBN*. `ISBN:7` is
// the access code for the ISBN index; the research records the trap, which is that the
// generic `Numerostandard:1016` silently degrades to a free-text search and answers zero.
const SBN = "https://opac.sbn.it/o/opac-api/titles-search-full-post";
const BY_ISBN = { "fieldstruct[1]": "ricerca.parole_tutte:4=6", "fieldaccess[1]": "ISBN:7" };

// Long enough for a catalogue that is slow, short enough that the owner is not left holding a
// phone in a shop. The covers module makes the same trade for the same reason.
const LONG_ENOUGH = 8_000;

/**
 * Ask SBN what is published under this ISBN.
 *
 * Everything that is not a plain 200 with a readable body is **unanswered**, including a
 * timeout and a refused connection: this endpoint's own documented failure mode is being
 * down, and the one thing this must never do is turn that into a fact about the book.
 */
export const askSbnAboutAnIsbn: AskAboutAnIsbn = async (isbn) => {
  let answered: Response;
  try {
    answered = await fetch(SBN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ core: "sbn", "fieldvalue[1]": isbn, ...BY_ISBN }),
      signal: AbortSignal.timeout(LONG_ENOUGH),
    });
  } catch (error) {
    return { answer: "unanswered", because: `SBN could not be reached (${reason(error)}).` };
  }

  if (!answered.ok) {
    return { answer: "unanswered", because: `SBN answered ${answered.status}.` };
  }

  let body: string;
  try {
    body = await answered.text();
  } catch (error) {
    return { answer: "unanswered", because: `SBN's answer broke off (${reason(error)}).` };
  }

  return readSbnSearch(body);
};

/** Whatever a thrown thing has to say for itself, in one clause. */
function reason(error: unknown): string {
  return error instanceof Error ? error.name : "no reason given";
}

/**
 * Read a search answer. **Pure: the text of the answer in, the answer out.**
 *
 * The first record wins. One ISBN legitimately has several — a reprint is its own record, and
 * One Piece 100 has two — and they differ in ways this app has no field for. Picking the
 * first is a choice rather than an oversight: what is being filled in is a form the owner is
 * looking at.
 */
export function readSbnSearch(body: string): RecordAnswer {
  let said: unknown;
  try {
    said = JSON.parse(body);
  } catch {
    // Liferay serves an HTML error page while this API is down, and the homepage keeps
    // answering 200 throughout, so this is a *failure of the endpoint* rather than a
    // malformed record.
    return { answer: "unanswered", because: "SBN answered with something that is not a record." };
  }

  const answer = said as {
    status?: unknown;
    data?: { results?: unknown };
  };

  if (answer.status !== "success") {
    return { answer: "unanswered", because: "SBN reported its own search as failed." };
  }

  const results = answer.data?.results;
  if (!Array.isArray(results)) {
    return { answer: "unanswered", because: "SBN's answer carried no list of records." };
  }
  if (results.length === 0) return { answer: "none" };

  const first = results[0] as { title?: { info?: unknown }; infos?: unknown };
  const title = theTitleItIs(typeof first.title?.info === "string" ? first.title.info : "");

  // A record with no readable title is **our** failure to read a librarian's field, not the
  // catalogue's failure to hold the book — so it is never written down as "no such ISBN".
  if (title === "") {
    return { answer: "unanswered", because: "SBN's record for that ISBN has no title in it." };
  }

  return { answer: "found", record: { title, publisher: thePublisherItIs(first.infos) } };
}

/**
 * The object's name, out of a librarian's title field.
 *
 * `{One piece}100 : La bambina diabolica / Eiichiro Oda` → `One piece 100`. Three cuts, and
 * each is a real case from a probe: the statement of responsibility after the slash is a
 * Credit and belongs to a Story rather than to this object; the chapter's own name after the
 * colon is not what the spine says; and the braces around a uniform title are punctuation the
 * catalogue uses to mark it, which is why removing them has to put the space back — otherwise
 * the Title field is filled in with `One piece100`.
 */
function theTitleItIs(info: string): string {
  const [named] = info.split(" / ");
  const [withoutTheSubtitle] = named.split(" : ");

  return withoutTheSubtitle
    .replace(/\}(?=\S)/g, "} ")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// `Bosco (Pg) : Star Comics, 2022` — place, publisher, year. The year is optional because a
// record that has none still names its publisher, and the place is thrown away: this library
// records who published an object and not where they were sitting.
const IMPRINT = /^[^:]+ : (.+?)(?:, [^,]*\d{4}[^,]*)?$/;

/** The publisher, out of whichever of a record's notes is the imprint. */
function thePublisherItIs(infos: unknown): string | null {
  if (!Array.isArray(infos)) return null;

  for (const note of infos) {
    if (typeof note !== "string") continue;
    const imprint = IMPRINT.exec(note);
    if (imprint) return imprint[1].trim();
  }

  return null;
}
