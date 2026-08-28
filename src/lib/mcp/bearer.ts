import { createHash, timingSafeEqual } from "node:crypto";

// The second door's gate, and the whole of it.
//
// The web view is gated by Google restricted to one address; `/mcp` is not, because a
// redirect to a consent screen is not an answer an assistant can read. It takes a
// **static bearer token** instead (ADR-0004) — a documented, first-class option for
// Claude's custom connectors, the Claude API's MCP connector and Claude Code
// (`docs/research/mcp-remote-auth.md`), which is why one string is enough here and no
// authorization server is built.
//
// Shaped like `@/lib/auth/gate`: **environment in, verdict out**, and pure. Nothing here
// reads a request, writes a response or knows what a status code is — that is the route
// handler's job, and keeping the predicate separate is what makes both directions of the
// gate a table of cases rather than an argument (`src/app/mcp/route.test.ts`).

/** The variable the token comes from. Documented in `.env.example`, valued nowhere. */
export const BEARER_VARIABLE = "MCP_BEARER_TOKEN";

/**
 * Why a request was refused. For the server's own diagnosis only — every one of them
 * comes back to the client as the same 401, because *which* mistake it was is
 * information the client has not earned.
 */
export type BearerRefusal =
  /** No token is configured, so nothing can be right. The deployment forgot a secret. */
  | "not-configured"
  /** No `Authorization: Bearer …` on the request. Ordinarily a client's first probe. */
  | "absent"
  /** A token arrived and it is not the owner's. */
  | "wrong";

export type BearerVerdict = { ok: true } | { ok: false; refusal: BearerRefusal };

/**
 * The token out of an `Authorization` header, or `null` if there is not one in it.
 *
 * The scheme is matched case-insensitively because RFC 7235 says it is case-insensitive
 * and a client sending `bearer` is right. Nothing about the token itself is forgiven: a
 * different scheme carrying the same secret is not a bearer token, and an empty one is
 * not a token.
 */
export function bearerFrom(authorization: string | null | undefined): string | null {
  const match = /^Bearer +(\S.*)$/i.exec((authorization ?? "").trim());
  return match ? match[1].trim() || null : null;
}

/**
 * Whether this request may read the library.
 *
 * **Fails closed**, for the reason the owner gate does: a deployment missing the
 * variable refuses every assistant rather than answering the whole collection to whoever
 * finds the URL. There is deliberately no development opt-in beside it — the owner gate
 * has one because there is no Google OAuth client to create yet, whereas a bearer token
 * is a string the owner picks, so there is nothing for an opt-in to stand in for.
 */
export function bearerGate(
  env: NodeJS.ProcessEnv,
  authorization: string | null | undefined
): BearerVerdict {
  const configured = env[BEARER_VARIABLE]?.trim();
  if (!configured) return { ok: false, refusal: "not-configured" };

  const presented = bearerFrom(authorization);
  if (presented === null) return { ok: false, refusal: "absent" };

  return isTheSameSecret(presented, configured) ? { ok: true } : { ok: false, refusal: "wrong" };
}

/**
 * Compare two secrets without telling the caller how close they got.
 *
 * `===` on strings returns as soon as two bytes differ, and the time it took is a
 * measurable answer to *"how much of the token did I guess?"* — which turns a search
 * over the whole token into a search over one character at a time.
 *
 * Both sides are hashed first and only then compared byte-for-byte in constant time. The
 * digest is what makes that possible at all: `timingSafeEqual` refuses buffers of
 * different lengths — the refusal itself would leak the configured token's length — and
 * SHA-256 turns any two strings into two 32-byte ones. The hash is not there to protect
 * the token at rest; it is there to make the lengths equal.
 */
function isTheSameSecret(presented: string, configured: string): boolean {
  return timingSafeEqual(digest(presented), digest(configured));
}

function digest(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}
