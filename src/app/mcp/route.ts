import { bearerGate } from "@/lib/mcp/bearer";
import { answer } from "@/lib/mcp/protocol";
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

  const { body } = await answer(await request.text(), mountedTools);

  // A notification has no id, so there is nobody to answer: the transport asks for an
  // empty 202 rather than a body, and `notifications/initialized` is the one a client
  // sends here.
  if (body === null) return new Response(null, { status: 202 });

  return Response.json(body);
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
 * The bearer gate, in front of the whole endpoint rather than of one method.
 *
 * Every refusal is the same 401 with the same body. Which mistake it was — no token, the
 * wrong token, or a deployment that forgot the variable — is written to the log for the
 * owner and never to the response, because it is information the caller has not earned.
 *
 * `WWW-Authenticate` is there so that a client is told how to authenticate rather than
 * left to guess (RFC 6750). It names no `resource_metadata`: that is how a client
 * discovers an authorization server, and there is none — the token is a static string the
 * owner configures (ADR-0004).
 *
 * **Rate limiting belongs here**, immediately before this gate, and is #15's: this is the
 * first publicly reachable service on the cluster, and an endpoint that answers a token
 * check to anyone who asks is an endpoint that can be asked forever.
 */
function refuse(request: Request): Response | null {
  const verdict = bearerGate(process.env, request.headers.get("authorization"));
  if (verdict.ok) return null;

  console.warn("MCP request refused", { refusal: verdict.refusal, method: request.method });

  return Response.json(
    { error: "unauthorized", message: "This endpoint needs the owner's bearer token." },
    { status: 401, headers: { "www-authenticate": 'Bearer realm="tsundoku"' } }
  );
}
