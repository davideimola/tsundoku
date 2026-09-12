import { createHash, timingSafeEqual } from "node:crypto";

import { clientOf, createRateLimiter } from "@/lib/mcp/rate-limit";

// **The third door's gate**, and the whole of it (ADR-0025).
//
// The web view is gated by Google restricted to one address, `/mcp` takes the assistant's
// bearer, and `/api` takes a third secret of its own: `API_BEARER_TOKEN`. Three doors, three
// authentications, and the reason this one is not the second one's is not symmetry. The MCP
// token lives in the owner's own assistant; this one lives in **somebody else's
// environment**, the host that builds the public page, and it has to be rotatable there
// without disconnecting an assistant, and revocable here without touching one.
//
// Shaped like `./gate.ts` and `@/lib/mcp/bearer.ts`: **environment in, verdict out**, and
// pure. Nothing in `apiCallerGate` reads a request or knows what a status code is. The thing
// above it, `requireApiCaller`, is the **refusing** half, and it is the one every route under
// `/api` calls first: the proxy in front of it is ergonomics, exactly as it is for the owner
// gate, and `src/app/api/gated.test.ts` is what fails when a route stops calling this.
//
// ## Why this is a sibling of `@/lib/mcp/bearer` and not a call into it
//
// The two files compare a presented secret against a configured one, in constant time, and
// the fifteen lines that do it are nearly the same fifteen lines. Folding them into one gate
// taking a variable name as an argument was considered and refused: the point of the third
// door is that its secret is **separate**, and a shared gate is one edit away from a shared
// default, a shared fallback, or a "use the MCP token if the API one is unset" convenience
// that would hand a page host the door that writes. Two files that cannot be made to agree
// is the property being bought, and the duplication is the price of it.
//
// ## What the token buys, and what it cannot
//
// **While one token exists, the API is read-only by construction**: there is no verb reachable
// from this door, no route under `/api` that writes, and nothing here that could grant one.
// When a second consumer with different permissions turns up, the move is scoped tokens as
// data (the way Medium and Type are data, ADR-0006 and ADR-0022) and not a fourth environment
// variable.

/**
 * The limit in front of this door, with **its own counters**.
 *
 * Its own, rather than the ones `/mcp` counts against, because the two doors' legitimate
 * traffic looks nothing alike and neither should be refused out of the other's allowance: one
 * page asking on a schedule against one assistant answering a person's questions. The
 * arithmetic and the two windows are shared, because they are the same argument written once.
 *
 * **It assumes one replica**, exactly as the module it comes from does and for the same
 * reason: the counters are a `Map` in this process for the life of the container. Two replicas
 * would hold two of each and both doors' effective limits would double, which is wrong in the
 * safe direction and loudly so.
 */
const rateLimit = createRateLimiter();

/**
 * The rate limit as a response, or `null` if this request fits inside it.
 *
 * `Retry-After` is in seconds, which is the form every client understands, and a 429 that
 * omits it leaves a well-behaved client guessing and a badly-behaved one retrying at once.
 */
function refuseAFlood(request: Request): Response | null {
  const client = clientOf(request.headers);
  const verdict = rateLimit(client, Date.now());
  if (verdict.ok) return null;

  console.warn("API request rate limited", { client, method: request.method });

  return Response.json(
    { error: "too_many_requests", message: "Too many requests. Wait, then ask again." },
    { status: 429, headers: { "retry-after": String(verdict.retryAfterInSeconds) } }
  );
}

/** The variable the token comes from. Documented in `.env.example`, valued nowhere. */
const API_BEARER_VARIABLE = "API_BEARER_TOKEN";

/**
 * Why a request was refused. For the server's own diagnosis only: every one of them comes
 * back as the same 401, because *which* mistake it was is information the caller has not
 * earned.
 */
export type ApiRefusal =
  /** No token is configured, so nothing can be right. The deployment forgot a secret. */
  | "not-configured"
  /** No `Authorization: Bearer …` on the request, or a blank one. */
  | "absent"
  /** A token arrived and it is not the owner's. */
  | "wrong";

export type ApiVerdict = { ok: true } | { ok: false; refusal: ApiRefusal };

/**
 * Whether this request may read what the API publishes.
 *
 * **Fails closed**, for the reason both other gates do: a deployment missing the variable
 * refuses every caller rather than publishing the library to whoever finds the URL. There is
 * deliberately no development opt-in beside it, unlike `AUTH_DEV_OPEN`: this is a string the
 * owner picks, so having one locally costs a line in `.env.local` and nothing else.
 */
export function apiCallerGate(
  env: NodeJS.ProcessEnv,
  authorization: string | null | undefined
): ApiVerdict {
  const configured = env[API_BEARER_VARIABLE]?.trim();
  if (!configured) return { ok: false, refusal: "not-configured" };

  const presented = bearerFrom(authorization);
  if (presented === null) return { ok: false, refusal: "absent" };

  return isTheSameSecret(presented, configured) ? { ok: true } : { ok: false, refusal: "wrong" };
}

/**
 * **The wall.** Call it first in every route handler under `/api`, and answer with what it
 * gives back where that is not `null`.
 *
 * ```ts
 * const refused = requireApiCaller(request);
 * if (refused) return refused;
 * ```
 *
 * It answers a `Response` rather than throwing, which is where it parts from
 * `requireOwner()`, and the reason is who is on the other side. A refused owner is a person
 * who should land on a sign-in screen, so the wall throws and the proxy does the friendly
 * part; a refused API caller is a program, and the only useful thing to hand a program is
 * the status and the header that name what it is missing.
 *
 * **The body says nothing about the library.** Not how many books, not whether the token was
 * close, not which of the three refusals it was. All three are one 401, and the one written
 * down is written to this server's own log.
 *
 * **The rate limit runs first**, before the gate and therefore before anything a caller could
 * make expensive: the SHA-256 in the comparison and the log line beside it included. That is
 * the same order `/mcp` puts them in and it is the same argument (`@/lib/mcp/rate-limit`), and
 * here it is worth more: an allowed request on this door composes a dozen queries over the
 * whole library, where an allowed one on `/mcp` answers a single question.
 */
export function requireApiCaller(request: Request): Response | null {
  const flooded = refuseAFlood(request);
  if (flooded) return flooded;

  const verdict = apiCallerGate(process.env, request.headers.get("authorization"));
  if (verdict.ok) return null;

  console.warn("API request refused", {
    refusal: verdict.refusal,
    method: request.method,
    path: new URL(request.url).pathname,
  });

  return Response.json(
    { error: "unauthorized", message: "This endpoint needs the API bearer token." },
    { status: 401, headers: { "www-authenticate": 'Bearer realm="tsundoku"' } }
  );
}

/**
 * The token out of an `Authorization` header, or `null` if there is not one in it.
 *
 * The scheme is matched case-insensitively because RFC 7235 says it is case-insensitive and
 * a client sending `bearer` is right. Nothing about the token itself is forgiven: a different
 * scheme carrying the same secret is not a bearer token, and an empty one is not a token.
 */
function bearerFrom(authorization: string | null | undefined): string | null {
  const match = /^Bearer +(\S.*)$/i.exec((authorization ?? "").trim());
  return match ? match[1].trim() || null : null;
}

/**
 * Compare two secrets without telling the caller how close they got.
 *
 * `===` on strings returns as soon as two bytes differ, and the time it took is a measurable
 * answer to *"how much of the token did I guess?"*, which turns a search over the whole token
 * into a search over one character at a time.
 *
 * Both sides are hashed first and only then compared byte-for-byte in constant time. The
 * digest is what makes that possible at all: `timingSafeEqual` refuses buffers of different
 * lengths (the refusal itself would leak the configured token's length) and SHA-256 turns any
 * two strings into two 32-byte ones. The hash is not there to protect the token at rest; it
 * is there to make the lengths equal.
 */
function isTheSameSecret(presented: string, configured: string): boolean {
  return timingSafeEqual(digest(presented), digest(configured));
}

function digest(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}
