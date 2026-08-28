import { isRefusal } from "@/core/refusal";
import type { McpTool } from "./tool.ts";

// MCP over one HTTP endpoint: the framing, and only the framing.
//
// This is the thin part of a thin adapter (ADR-0002). It parses JSON-RPC, answers the
// four methods a tools-only server owes a client, hands a call to a tool and turns what
// comes back — an answer or a `Refusal` — into something an assistant can read. It knows
// nothing about Stories, Volumes or SQL, and the moment it does, the thing it learned
// belongs in `src/core`.
//
// **Streamable HTTP, statelessly.** One POST carries one JSON-RPC message and gets one
// JSON response; there is no session id, no SSE stream and nothing to resume. The
// transport permits exactly this — a server MAY answer a POST with `application/json`
// instead of a stream — and for a read door over a database it is the whole of what is
// needed. Nothing here holds state between requests, which is also why the container can
// be restarted under a connected assistant without it noticing.

/**
 * The revisions this server will speak, newest first.
 *
 * A client names one in `initialize` and gets that one back if it is here, or the newest
 * one we know if it is not — which is what the handshake is for. The list is short and
 * concrete rather than "whatever the client said": the three below differ in ways that do
 * not touch a tools-only server, and a revision nobody has read is not a promise to make.
 * The newest MCP revision is deliberately absent — it removes `initialize` altogether,
 * and no client documents it yet (`docs/research/mcp-remote-auth.md`).
 */
export const SPOKEN_REVISIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;

const NEWEST = SPOKEN_REVISIONS[0];

/** What an assistant is told this server is, and what it is for. */
const SERVER_INFO = {
  name: "tsundoku",
  title: "tsundoku",
  version: "0.1.0",
} as const;

/**
 * Read to the assistant before it asks anything, and the one place this door is allowed
 * to be opinionated — because the vocabulary *is* the product (`CONTEXT.md`), and an
 * assistant that thinks a rating belongs to a book will ask the wrong question of every
 * tool here.
 */
const INSTRUCTIONS = `tsundoku is one person's library. Two facts are separate and never correspond:
a **Story** is what they read and formed an opinion about, at whatever granularity they chose — one
volume, an arc, or a whole series; a **Volume** is a physical object on their shelf. A **Rating** —
1 to 10 in half points, with prose — is always of a Story and never of a Volume, and a Story may
have several **Readings**, because rereading is ordinary and every reading keeps the judgement it
carried. Every Reading and Rating carries a **Provenance** saying how it came to be known: weigh
"Goodreads history" and "converted from a coarser scale" less heavily than "remembered".
Recommend from the prose, not from the score alone. Digital ownership is not modelled: an ebook is
a Reading with a digital medium and no Volume.`;

// JSON-RPC's own codes. This server adds none: a refusal from the model is an answer
// rather than an error, and it travels as a tool result (see `called`).
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

type Id = string | number | null;

type Message = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

/**
 * What the route handler should send back: a JSON-RPC message, or nothing at all.
 *
 * `null` is the answer to a notification. A notification has no id, so there is nobody to
 * answer, and the transport asks for an empty 202 rather than a body.
 */
export type Answer = { readonly body: unknown };

/**
 * Answer one MCP message.
 *
 * `text` is the request body as it arrived, unparsed, because a malformed body is a
 * JSON-RPC parse error rather than an HTTP one and this is the layer that knows that.
 *
 * `mounted` is passed in rather than reached for — the framing and the tool list are
 * separate things — and it is a function rather than an array so that discovery happens
 * only when a method needs it. `initialize` and `ping` are answered without touching the
 * bundler's context module, which is what lets the door be exercised outside one.
 */
export async function answer(text: string, mounted: () => Promise<McpTool[]>): Promise<Answer> {
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return failure(null, PARSE_ERROR, "That request body is not JSON.");
  }

  // Batching was removed from MCP in the 2025-06-18 revision, so an array is not a thing
  // this server has to unpick.
  if (Array.isArray(message)) {
    return failure(null, INVALID_REQUEST, "This server does not accept batched requests.");
  }

  const { id, method, params } = read(message);
  if (typeof method !== "string") {
    // `null` where there was no id: there is nothing to correlate the answer with, and
    // JSON-RPC's own answer to that is a null id rather than a missing one.
    return failure(id ?? null, INVALID_REQUEST, "A JSON-RPC request needs a `method`.");
  }

  // A notification: no id, so no answer. `notifications/initialized` is the only one a
  // client sends a tools-only server, and there is nothing for it to do — this server
  // keeps no session to mark as ready.
  if (id === undefined) return { body: null };

  try {
    return await answered(id, method, params, mounted);
  } catch (error) {
    // A `Refusal` from a verb is domain vocabulary and is handled where the call was
    // made; anything reaching here is a bug in this app, so it becomes an internal error
    // with no prose invented for it. Nobody dresses a broken query up as advice.
    console.error("MCP request failed", { method, error });
    return failure(id, INTERNAL_ERROR, "That request failed inside the server.");
  }
}

async function answered(
  id: Id,
  method: string,
  params: unknown,
  mounted: () => Promise<McpTool[]>
): Promise<Answer> {
  switch (method) {
    case "initialize":
      return result(id, initialize(params));
    case "ping":
      // The spec's own keep-alive: an empty result, and the reason a connector can tell
      // "the token is wrong" from "the server is asleep".
      return result(id, {});
    case "tools/list":
      return result(id, { tools: listed(await mounted()) });
    case "tools/call":
      return await called(id, params, mounted);
    default:
      return failure(id, METHOD_NOT_FOUND, `This server does not implement \`${method}\`.`);
  }
}

function initialize(params: unknown) {
  const asked = readString(params, "protocolVersion");
  const spoken = SPOKEN_REVISIONS.find((revision) => revision === asked);

  return {
    protocolVersion: spoken ?? NEWEST,
    // Tools, and nothing else. There are no resources and no prompts here on purpose:
    // every question this app answers is a query with arguments, and a resource list
    // would be a second way to ask the same things.
    capabilities: { tools: { listChanged: false } },
    serverInfo: SERVER_INFO,
    instructions: INSTRUCTIONS,
  };
}

function listed(tools: McpTool[]) {
  return tools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: { title: tool.title, readOnlyHint: tool.readOnly },
  }));
}

async function called(id: Id, params: unknown, mounted: () => Promise<McpTool[]>): Promise<Answer> {
  const name = readString(params, "name");
  const tool = (await mounted()).find((candidate) => candidate.name === name);
  if (!tool) {
    return failure(id, INVALID_PARAMS, `There is no tool called \`${name}\` here.`);
  }

  const input = readObject(params, "arguments");

  try {
    const answered = await tool.run(input);
    return result(id, {
      // Text, and pretty. An assistant reads this, and a JSON document it can quote back
      // to the owner is worth the extra bytes over one long line.
      content: [{ type: "text", text: JSON.stringify(answered, null, 2) }],
    });
  } catch (error) {
    // The one thing that is an *answer* rather than a failure: the model said no. A
    // refusal carries a stable code and prose written by the verb
    // (`src/core/verbs/README.md`), and both cross this edge — the prose because an
    // assistant relays it to the owner, the code because an assistant that reads
    // `already-exists` can try something else where prose would only be re-guessed.
    //
    // A tool error is a *result* with `isError`, not a JSON-RPC error: the distinction is
    // the spec's, and it is what lets the assistant see the refusal and react instead of
    // the client reporting a transport fault.
    if (!isRefusal(error)) throw error;

    return result(id, {
      isError: true,
      content: [{ type: "text", text: error.message }],
      _meta: { "tsundoku/refusal": { code: error.code } },
    });
  }
}

/** Read a message's three fields, distinguishing "absent" from "null". */
function read(message: unknown): { id: Id | undefined; method: unknown; params: unknown } {
  const record = (message ?? {}) as Message;
  const id = "id" in record ? (record.id as Id) : undefined;
  return { id, method: record.method, params: record.params };
}

function readString(params: unknown, key: string): string | undefined {
  const value = (params as Record<string, unknown> | null)?.[key];
  return typeof value === "string" ? value : undefined;
}

function readObject(params: unknown, key: string): Record<string, unknown> {
  const value = (params as Record<string, unknown> | null)?.[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function result(id: Id, payload: unknown): Answer {
  return { body: { jsonrpc: "2.0", id, result: payload } };
}

function failure(id: Id, code: number, message: string): Answer {
  return { body: { jsonrpc: "2.0", id, error: { code, message } } };
}
