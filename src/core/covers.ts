import "server-only";

// WHERE A COVER COMES FROM, and the only file in this repository that knows what a `fetch`
// is (#32).
//
// It sits beside `db.ts` for the same reason that one does: the pool is infrastructure the
// core owns rather than something an adapter hands it, and so is this. What the core README
// keeps out — HTTP, sessions, bearer tokens, MCP framing — is the *inbound* door's business;
// a source the library asks a question of is a dependency of the model, like the database.
//
// **Two sources, both keyless, and the ranking is measured rather than assumed**
// (`docs/research/cover-images-by-isbn.md`, 54 real Italian-market ISBNs, 2026-08-30/31):
//
//   Google Books, via *Dynamic Links*  49/54 — 91%.  "No API key or other authorization is
//                                      needed to use dynamic links." The v1 REST API is not
//                                      an option: keyless it answers 429 with
//                                      `"quota_limit_value": "0"`.
//   Open Library Covers               3/54 — 5.6%, all three Bao, zero manga. It adds
//                                      nothing this sample could measure, and it is here
//                                      anyway: it is the one source that *asks* to be
//                                      hotlinked from a public page, and its stock of
//                                      Italian graphic novels will plausibly grow.
//
// **Three findings are wired into the code below rather than left in the document.**
//
//   1. *128 pixels is the whole story.* Google's thumbnail comes back at `zoom=5` and is
//      128×195; every larger `zoom` returns a byte-identical "image not available"
//      placeholder, verified across five volumes. So the URL is stored exactly as the
//      source gave it and never widened — a bigger cover is an owner's photograph, not a
//      parameter.
//   2. *A rate limit is not an absence.* Open Library answers **403** at 100 requests per
//      IP per five minutes, and the first run of that research recorded 403 as "no cover"
//      and produced a false 0%. Every reader here answers `unanswered` for anything that
//      is not a plain yes or no, and the verb records nothing for it.
//   3. *The bytes may not be kept* (ADR-0013). Nothing in this file reads a response body
//      that is an image. What it answers with is a URL on somebody else's domain, and
//      `hotlinkable` is what refuses to hand back anything else.

/** Which source answered. Matches `volume_cover_source_is_one_this_app_looks_up`. */
export type CoverSourceName = "google-books" | "open-library";

/** A cover, as a reference to somebody else's bytes — which is all this app may hold. */
export type FoundCover = {
  readonly source: CoverSourceName;
  /**
   * The source's own id for the record — Google Books' volume id, read out of the
   * thumbnail URL it hands over. `null` where the source has no id but the ISBN itself.
   *
   * It is stored because it is a fact about the *record* rather than a copy of the content,
   * and because the ISBN → thumbnail hop is the expensive half of the lookup.
   */
  readonly reference: string | null;
  /** What an `<img src>` points at, always on the source's own domain. */
  readonly url: string;
  /**
   * The source's own page for this book. Google Books' branding guidelines require a
   * prominent per-book link to it on a public page, and the same response carries it.
   */
  readonly infoUrl: string | null;
};

/**
 * What a source said. **Three answers and not two**: a source that could not be asked is
 * not a source saying no.
 */
export type CoverAnswer =
  | { readonly answer: "found"; readonly cover: FoundCover }
  | { readonly answer: "none" }
  | { readonly answer: "unanswered"; readonly because: string };

/** Ask for one ISBN's cover. The verb takes one of these so a test needs no network. */
export type AskForACover = (isbn: string) => Promise<CoverAnswer>;

/** Whether a URL this app already recorded still resolves. `unknown` changes nothing. */
export type StillThere = (url: string) => Promise<"there" | "gone" | "unknown">;

// The domains a cover may be served from, written here and — as the same regex — in
// `db/schema.ts`, from which the migration's `volume_cover_is_hotlinked_and_never_hosted`
// check is generated. Twice on purpose, and the two are not redundant: the constraint is the
// wall, and this is what turns a source's oddity into an `unanswered` the owner reads rather
// than an integrity violation that reaches them as a 500.
//
// `bks0.books.google.com` and its siblings are Google's own cover hosts and appear in URLs
// Dynamic Links hands over; a probe on 2026-08-31 returned the bare `books.google.com` form,
// but the numbered one is the same CDN and refusing it would turn a real cover into a
// permanent `unanswered`. Everything else is out, `http` included: a mixed-content image is
// blocked by the browser anyway, and an address that is not a source's own is an address
// somebody would have had to copy the bytes to.
const THEIR_OWN_DOMAINS =
  /^https:\/\/((bks[0-9]+\.)?books\.google\.com|covers\.openlibrary\.org)\//;

/**
 * Whether a URL is one this app is allowed to point an `<img>` at: `https`, and on the
 * source's own domain.
 *
 * A cover is hotlinked and never hosted (ADR-0013), so a URL anywhere else is not a cover
 * with an unusual address — it is a URL that would have to be fetched and kept, which is
 * the thing the decision forbids.
 */
export function hotlinkable(url: string): boolean {
  return THEIR_OWN_DOMAINS.test(url);
}

/**
 * Google Books' volume id, read out of a thumbnail URL, or `null` where there is none.
 *
 * `…/books/content?id=njT-zgEACAAJ&printsec=frontcover&img=1&zoom=5` → `njT-zgEACAAJ`. The
 * id is the only part of that URL worth naming separately: there is no way to build the
 * image address from the ISBN, so this is what a second lookup would otherwise cost.
 */
export function googleVolumeId(thumbnailUrl: string): string | null {
  try {
    return new URL(thumbnailUrl).searchParams.get("id");
  } catch {
    return null;
  }
}

/**
 * Read a Dynamic Links response. **Pure: the text of the answer in, the answer out.**
 *
 * The endpoint is JSONP — `x({…});` — and the three-way discrimination the design needs is
 * the shape of the object inside it:
 *
 *   the `ISBN:<isbn>` key is absent   no record at all
 *   the key is there, no thumbnail    a record exists and has no cover
 *   the key is there with a thumbnail a cover
 *
 * The first two are both `none`, because the difference is about Google's catalogue and not
 * about this library: either way there is no cover to point at, and the verb records the
 * same absence. A body it cannot read at all is `unanswered` — an error page, a challenge,
 * a truncated response — because the one thing that must never happen is a broken answer
 * being written down as *this book has no cover*.
 */
export function readDynamicLinks(isbn: string, body: string): CoverAnswer {
  const opened = body.indexOf("(");
  const closed = body.lastIndexOf(")");
  if (opened === -1 || closed <= opened) {
    return {
      answer: "unanswered",
      because: "Google Books answered something that is not a callback.",
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.slice(opened + 1, closed));
  } catch {
    return {
      answer: "unanswered",
      because: "Google Books answered a callback this app could not read.",
    };
  }

  if (typeof payload !== "object" || payload === null) {
    return {
      answer: "unanswered",
      because: "Google Books answered a callback this app could not read.",
    };
  }

  const record = (payload as Record<string, unknown>)[`ISBN:${isbn}`];
  if (typeof record !== "object" || record === null) return { answer: "none" };

  const thumbnail = (record as Record<string, unknown>).thumbnail_url;
  const info = (record as Record<string, unknown>).info_url;
  if (typeof thumbnail !== "string" || thumbnail === "") return { answer: "none" };

  if (!hotlinkable(thumbnail)) {
    // Not an absence and not a cover: Google handed over an address this app may not point
    // at, which is a thing to look at rather than a thing to write down.
    return {
      answer: "unanswered",
      because: "Google Books answered with an image somewhere this app may not hotlink.",
    };
  }

  return {
    answer: "found",
    cover: {
      source: "google-books",
      reference: googleVolumeId(thumbnail),
      url: thumbnail,
      infoUrl: typeof info === "string" && info !== "" ? info : null,
    },
  };
}

/**
 * Read an Open Library covers probe. **Pure: an HTTP status in, the answer out.**
 *
 * Asked with `?default=false`, which is the whole reason this reader can say anything at
 * all: "*By default it returns a blank image if the cover cannot be found. If you append
 * `?default=false` … then it returns a 404 instead.*" Without it every ISBN is a 200 and a
 * placeholder would go on the wall as a cover.
 *
 * **403 is not 404.** The ISBN-keyed cover path is rate-limited to 100 requests per IP per
 * five minutes and answers 403 over it; collapsing that into an absence is the mistake that
 * produced a false 0% in the research this is built on.
 */
export function readOpenLibraryProbe(isbn: string, status: number): CoverAnswer {
  if (status === 200 || status === 302 || status === 301 || status === 307) {
    return {
      answer: "found",
      cover: {
        source: "open-library",
        // No id of its own: what Open Library was asked by is the ISBN, and what it answers
        // with is a redirect into an Internet Archive item. The ISBN is already on the row.
        reference: null,
        url: openLibraryCover(isbn),
        // The courtesy link back the covers API asks for, which is also the record itself.
        infoUrl: `https://openlibrary.org/isbn/${isbn}`,
      },
    };
  }

  if (status === 404) return { answer: "none" };
  if (status === 403) {
    return {
      answer: "unanswered",
      because: "Open Library is rate-limiting this address. Try again in a few minutes.",
    };
  }
  return { answer: "unanswered", because: `Open Library answered ${status}.` };
}

/**
 * The Open Library cover address for an ISBN, **with `?default=false` kept in it**.
 *
 * The parameter is not only how the probe reads: it is stored and hotlinked, so a cover
 * that is withdrawn later leaves a broken image the lazy re-check can see, rather than a
 * blank placeholder nobody could tell from a jacket.
 */
function openLibraryCover(isbn: string): string {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
}

// Who this is, said to the sources that ask. Open Library gives an identified caller three
// requests a second where an anonymous one gets one, and a source that wants to complain
// about our traffic should be able to find out whose it is.
const WHO_IS_ASKING = "tsundoku/1.0 (single-owner library; https://tsundoku.davideimola.dev)";

// Long enough for a slow CDN, short enough that a hung source does not hold a form post
// open behind it. A timeout is `unanswered`, never an absence.
const PATIENCE = 10_000;

async function ask(url: string, method: "GET" | "HEAD"): Promise<Response> {
  return fetch(url, {
    method,
    headers: { "user-agent": WHO_IS_ASKING },
    // Manual, because the redirect *is* the answer at Open Library: a 302 into an Internet
    // Archive item means the cover exists, and following it would land on bytes this app has
    // no business fetching.
    redirect: "manual",
    signal: AbortSignal.timeout(PATIENCE),
    cache: "no-store",
  });
}

/**
 * Ask Google Books, keylessly, through the Dynamic Links endpoint.
 *
 * Not the v1 REST API: keyless it answers 429 with `"quota_limit_value": "0"`, which is the
 * anonymous per-day quota being zero rather than a limit that resets. Dynamic Links is
 * separately documented and needs nothing.
 */
export async function askGoogleBooks(isbn: string): Promise<CoverAnswer> {
  const url = `https://books.google.com/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&jscmd=viewapi&callback=x`;

  let response: Response;
  try {
    response = await ask(url, "GET");
  } catch (reason) {
    return { answer: "unanswered", because: `Google Books could not be reached: ${why(reason)}` };
  }

  if (!response.ok)
    return { answer: "unanswered", because: `Google Books answered ${response.status}.` };

  return readDynamicLinks(isbn, await response.text());
}

/** Ask Open Library, keylessly, with `default=false` so a placeholder is never a cover. */
export async function askOpenLibrary(isbn: string): Promise<CoverAnswer> {
  let response: Response;
  try {
    response = await ask(openLibraryCover(isbn), "HEAD");
  } catch (reason) {
    return { answer: "unanswered", because: `Open Library could not be reached: ${why(reason)}` };
  }

  return readOpenLibraryProbe(isbn, response.status);
}

/**
 * The sources, in the order the measurement puts them: Google Books, and Open Library for
 * what Google does not have.
 *
 * **The second source is only reached on a plain no.** Google answering `unanswered` — a
 * timeout, a challenge, a 5xx — stops the lookup for that object, because the point of
 * asking a second source is to cover a gap in the first one's catalogue and not to paper
 * over a failure to ask it.
 */
export const theSources: AskForACover = async (isbn) => {
  const google = await askGoogleBooks(isbn);
  if (google.answer !== "none") return google;

  return askOpenLibrary(isbn);
};

/**
 * Whether a cover this app already recorded is still where it was.
 *
 * **Anything that is not a plain 404 leaves the record alone.** A 403, a 429, a 5xx or a
 * refused `HEAD` says nothing about whether the image is there, and clearing a good cover
 * off the wall because a CDN was unhappy for a minute is the failure this hedges against.
 */
export const stillThere: StillThere = async (url) => {
  let response: Response;
  try {
    response = await ask(url, "HEAD");
  } catch {
    return "unknown";
  }

  if (response.status === 404 || response.status === 410) return "gone";
  if (response.status < 400) return "there";
  return "unknown";
};

/** What went wrong, in as many words as a caller can put in a report. */
function why(reason: unknown): string {
  return reason instanceof Error ? reason.message : "the request failed";
}
