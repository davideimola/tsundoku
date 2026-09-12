import { createHash } from "node:crypto";

import { type Showcase, theShowcase } from "@/core/queries/showcase";
import { requireApiCaller } from "@/lib/auth/api";

// **The third door**, and its first resource (ADR-0025).
//
// One route handler, and as little of it as possible, exactly like the second door: it asks
// `@/lib/auth/api` whether this caller may read anything at all, hands the one question to
// `@/core/queries/showcase`, and turns the answer into an HTTP response. It holds no domain
// logic and no SQL (ADR-0002). What may be seen from outside is decided in the core query and
// nowhere else, so a second resource under `/api` cannot come to publish a different subset
// by accident.
//
// It is not a page and it is not in a route group. `src/proxy.ts` excludes `/api/showcase`
// from the Google matcher **by name**, and by name is the point: `/api` is not excluded as a
// prefix, because `/api/auth` already lives there and because a prefix-wide hole is a hole
// every future route falls into without anyone deciding. A route added under `/api` and not
// named in the matcher is gated by Google and answers `307 /signin`, which is wrong in the
// safe direction and loudly so.

/** The pool is node's, and every request reads the database. Nothing here is static. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How long a consumer may hold this before asking again. Five minutes, and **private**.
 *
 * Private because this is one person's library behind one bearer token: a shared cache in
 * between, whether a CDN or a company proxy, must not hand the document to the next request
 * that arrives without one. Five minutes because the page this feeds is rebuilt on a schedule
 * measured in hours, so the window costs the consumer nothing and costs a home cluster a
 * great deal less than a build loop asking on every render.
 */
const HOW_LONG_IT_MAY_BE_HELD = "private, max-age=300";

/**
 * The showcase: what is being gone through, what concluded, what is unopened, and the shelf.
 *
 * `?types=manga,videogame` narrows every block by Type slug, and an unknown slug is a 400
 * rather than an empty document: a consumer fetching on a schedule would otherwise publish an
 * empty shelf for a week without learning that a Type had been renamed.
 *
 * **`shelf.volumes` and `pile.recent` are samples and not the whole thing.** Each is capped
 * and ordered by what arrived most recently, and the real figure travels beside it as
 * `shelf.total` and `pile.count`, so a page can say *showing 60 of 412*. Nothing here is a
 * paginated collection and there is deliberately no cursor: the consumer is a shelf page and
 * not a catalogue, and a door that let somebody walk the whole library sixty rows at a time
 * would be publishing what the caps exist to keep to a sample.
 */
export async function GET(request: Request): Promise<Response> {
  const refused = requireApiCaller(request);
  if (refused) return refused;

  const answer = await theShowcase({
    types: theTypesAsked(new URL(request.url)),
    wishlist: theWishlistIsPublished(process.env),
  });

  if (!answer.ok) {
    return Response.json(
      {
        error: "unknown_type",
        message: `No such Type: ${answer.unknown.join(", ")}.`,
        unknown: answer.unknown,
      },
      { status: 400 }
    );
  }

  return answered(answer.showcase, request);
}

/**
 * The Types asked for, or `null` for every Type.
 *
 * An absent parameter is every Type; a present one is the list it names, commas and spaces
 * forgiven, **including the empty list**. `?types=` asking for nothing gets nothing, which is
 * the honest answer to a consumer that built the parameter out of an empty array, and is the
 * one case where saying *everything* would be a page quietly publishing more than it asked
 * for.
 */
function theTypesAsked(url: URL): string[] | null {
  const asked = url.searchParams.get("types");
  if (asked === null) return null;

  return asked
    .split(",")
    .map((slug) => slug.trim())
    .filter((slug) => slug !== "");
}

/**
 * Whether this deployment publishes the wishlist. **Off unless it says so**, in the same
 * words the gates are opened with elsewhere: the value has to be `true` rather than merely
 * present, so an empty variable left behind in a cluster does not publish what the owner
 * means to buy.
 */
function theWishlistIsPublished(env: NodeJS.ProcessEnv): boolean {
  return env.SHOWCASE_WISHLIST?.trim().toLowerCase() === "true";
}

/**
 * The document, with the ETag that lets a consumer skip it.
 *
 * **The ETag is computed over the document without `generatedAt`**, and that is the whole of
 * why this function exists. The stamp changes on every request by definition, so hashing the
 * body would produce a new ETag every time and a validator that never validated: what the
 * consumer is asking is *has the library changed*, and the moment this was composed is not
 * part of the answer. A 304 therefore carries no body and no new stamp, which is correct: the
 * consumer already has one, and it is still true.
 *
 * `Cache-Control` travels on the 304 as well, because a validated response's headers replace
 * the stored ones and dropping it there would silently shorten the window to nothing.
 */
function answered(showcase: Showcase, request: Request): Response {
  const { generatedAt: _composedAt, ...contents } = showcase;
  const etag = `"${createHash("sha256").update(JSON.stringify(contents)).digest("base64url")}"`;

  if (alreadyHeld(request.headers.get("if-none-match"), etag)) {
    return new Response(null, {
      status: 304,
      headers: { etag, "cache-control": HOW_LONG_IT_MAY_BE_HELD },
    });
  }

  return Response.json(showcase, {
    headers: { etag, "cache-control": HOW_LONG_IT_MAY_BE_HELD },
  });
}

/**
 * Whether the consumer already holds this exact document.
 *
 * `If-None-Match` is a **list** by RFC 9110 and an entry may be weak, so a caller echoing
 * `W/"…"` or holding two versions is answered rather than handed the whole shelf again. `*`
 * means *any representation you have*, which here is the one being composed.
 */
function alreadyHeld(offered: string | null, etag: string): boolean {
  if (!offered) return false;

  return offered
    .split(",")
    .map((held) => held.trim().replace(/^W\//, ""))
    .some((held) => held === etag || held === "*");
}
