import { bearerGate } from "@/lib/mcp/bearer";
import { answer } from "@/lib/mcp/protocol";
import { clientOf, rateLimit } from "@/lib/mcp/rate-limit";
import { mountedTools } from "@/lib/mcp/tools";

// The second door. One route handler, and as little of it as possible.
//
// It does three things and delegates all three: it asks `@/lib/mcp/bearer` whether this
// request may read the library, hands the body to `@/lib/mcp/protocol` to be answered as
// MCP, and turns the answer into an HTTP response. It holds no domain logic, no SQL and no
// tool list (ADR-0002) — **a slice exposing a new query adds a file under
// `src/lib/mcp/tools/` and never touches this one**. See `src/lib/mcp/README.md`.
//
// It is not a page and it is not in a route group. `src/proxy.ts` excludes `/mcp` from the
// Google matcher by name, because this door is authenticated by a static bearer instead
// (ADR-0004) and a redirect to a consent screen is not an answer an assistant can read.
// The gate below is therefore the only thing in front of the library here, which is why it
// is the first statement in every method and why it fails closed.

/** The pool is node's, and every request reads the database. Nothing here is static. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const refused = refuse(request);
  if (refused) return refused;

  const answered = await answer(await request.text(), mountedTools);

  // A notification has no id, so there is nobody to answer: the transport asks for an
  // empty 202 rather than a body, and `notifications/initialized` is the one a client
  // sends here.
  if (answered === null) return new Response(null, { status: 202 });

  return Response.json(answered);
}

/**
 * No SSE stream to open, so nothing to GET.
 *
 * A client MAY try — that is how it would subscribe to server-initiated messages — and
 * 405 is the answer the transport specifies for a server that does not offer one. This
 * server has nothing to push: every answer here is a reply to a question.
 */
export async function GET(request: Request): Promise<Response> {
  return refuse(request) ?? new Response(null, { status: 405 });
}

/**
 * The two things in front of the library on this door, in the order they have to be in:
 * **the rate limit, then the bearer gate**.
 *
 * That order is the whole point of the first one. This is the only publicly reachable
 * service on the cluster (ADR-0004), and an endpoint that answers a token check to anyone
 * who asks is an endpoint that can be asked forever — so the limiter runs before anything
 * a caller could make expensive, the SHA-256 in the gate and the log line beside it
 * included. What it counts, and why the state being in this process is an assumption
 * rather than an oversight, is `@/lib/mcp/rate-limit`.
 *
 * Neither refusal says which one it was beyond its own status: a 429 names a wait because
 * that is the only thing that helps a client behave, and a 401 names nothing because which
 * mistake it was is information the caller has not earned. Both are written to the log for
 * the owner.
 */
function refuse(request: Request): Response | null {
  const flooded = refuseAFlood(request);
  if (flooded) return flooded;

  const verdict = bearerGate(process.env, request.headers.get("authorization"));
  if (verdict.ok) return null;

  console.warn("MCP request refused", { refusal: verdict.refusal, method: request.method });

  return Response.json(
    { error: "unauthorized", message: "This endpoint needs the owner's bearer token." },
    { status: 401, headers: { "www-authenticate": 'Bearer realm="tsundoku"' } }
  );
}

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

  console.warn("MCP request rate limited", { client, method: request.method });

  return Response.json(
    { error: "too_many_requests", message: "Too many requests. Wait, then ask again." },
    { status: 429, headers: { "retry-after": String(verdict.retryAfterInSeconds) } }
  );
}
