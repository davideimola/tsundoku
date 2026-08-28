import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PER_CLIENT } from "@/lib/mcp/rate-limit";

import { GET, POST } from "./route";

// Seam 2, the other half of it. `src/proxy.test.ts` covers the Google gate over the web
// view; this covers the door beside it, which is authenticated by a **static bearer
// token** and not by Google (ADR-0004).
//
// It is the same posture and the same thinness: a real `Request`, the real route
// handler, no mock of the thing under test, and no database — the token is a string
// compared against configuration, and nothing about it needs a Postgres. What the tools
// then answer is Seam 1's business, because both doors are thin adapters over the same
// core (ADR-0002) and this one holds no domain logic to test.
//
// The happy path asks for `initialize` deliberately. It is the one method that proves
// the request got past the gate and was answered as MCP without reaching a tool: the
// tool areas are discovered by the application's bundler (see `src/lib/mcp/README.md`),
// which is not what runs a vitest file.

const TOKEN = "a-bearer-for-this-test-and-nowhere-else";

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = process.env;
  process.env = { ...saved, MCP_BEARER_TOKEN: TOKEN };
});

afterEach(() => {
  process.env = saved;
});

/**
 * A distinct caller for every request in this file.
 *
 * The rate limiter in front of the gate counts per client and remembers between requests
 * (`@/lib/mcp/rate-limit`), so a file that let every case share one address would be a
 * file whose last cases fail once somebody adds a few more. Each request here arrives
 * from its own address instead, which is also the honest shape: these are cases about the
 * token, and none of them is about a flood.
 */
let callers = 0;

function fromSomewhereNew(): string {
  callers += 1;
  return `198.51.100.${callers}`;
}

/** A `tools/list` call — the cheapest well-formed request there is — with `authorization`. */
function post(
  authorization?: string,
  body: unknown = { jsonrpc: "2.0", id: 1, method: "ping" },
  client: string = fromSomewhereNew()
) {
  const headers = new Headers({ "content-type": "application/json", "x-forwarded-for": client });
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("https://tsundoku.example.com/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("the bearer gate at the HTTP edge", () => {
  it("refuses a request carrying no token at all", async () => {
    const response = await POST(post());

    expect(response.status).toBe(401);
    // So that a client is told *how* to authenticate rather than left to guess, which is
    // what RFC 6750 asks of a 401 and what lets a connector report something useful.
    expect(response.headers.get("www-authenticate")).toMatch(/^Bearer /);
  });

  it("refuses a request carrying the wrong token", async () => {
    expect((await POST(post(`Bearer ${TOKEN}-but-not-quite`))).status).toBe(401);
  });

  it("refuses a token that is merely a prefix of the right one", async () => {
    expect((await POST(post(`Bearer ${TOKEN.slice(0, -1)}`))).status).toBe(401);
  });

  it("refuses another scheme carrying the right secret", async () => {
    expect((await POST(post(`Basic ${TOKEN}`))).status).toBe(401);
  });

  it("refuses an empty bearer", async () => {
    expect((await POST(post("Bearer "))).status).toBe(401);
  });

  // Fail closed, exactly as the owner gate does without `AUTH_OWNER_EMAIL`: a
  // deployment that forgot the variable refuses every assistant rather than answering
  // the library to anyone who finds the URL.
  it("refuses everything when no token is configured", async () => {
    delete process.env.MCP_BEARER_TOKEN;

    expect((await POST(post(`Bearer ${TOKEN}`))).status).toBe(401);
    expect((await POST(post())).status).toBe(401);
  });

  it("refuses everything when the configured token is blank", async () => {
    process.env.MCP_BEARER_TOKEN = "   ";

    expect((await POST(post("Bearer    "))).status).toBe(401);
  });

  it("answers a request carrying the configured token", async () => {
    const response = await POST(
      post(`Bearer ${TOKEN}`, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "a test" } },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "tsundoku" },
      },
    });
  });

  // The scheme is case-insensitive by RFC 7235, and a client that sends `bearer` is
  // right. Nothing else about the token is.
  it("accepts the scheme in any case", async () => {
    expect((await POST(post(`bearer ${TOKEN}`))).status).toBe(200);
  });

  // The gate is the whole endpoint and not one method of it. There is no SSE stream to
  // open here, so a GET is answered 405 — but only once it has proved who it is.
  it("stands in front of every method, not only POST", async () => {
    expect((await GET(post())).status).toBe(401);
    expect((await GET(post(`Bearer ${TOKEN}`))).status).toBe(405);
  });
});

// The one thing about the tools that is testable from here, and the one worth testing:
// **this door never reports an empty tool list.**
//
// The list is the `tools/` directory, resolved by the application's bundler
// (`src/lib/mcp/README.md`), so a vitest file cannot ask what is in it — which is exactly
// the shape of the failure this pins. Every way discovery can break, in a bundler or in a
// harness, arrives as zero tools and as nothing else: the door still answers, a client
// still connects, and the assistant reports that the library has nothing to offer. So an
// empty list is refused rather than served, and the request fails where somebody will see
// it.
describe("the tool list", () => {
  it("is an error rather than an empty list when discovery cannot answer", async () => {
    const response = await POST(
      post(`Bearer ${TOKEN}`, { jsonrpc: "2.0", id: 1, method: "tools/list" })
    );

    expect(await response.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32603 },
    });
  });
});

// The other thing standing in front of the library on this door, and the only thing about
// it that is testable from out here: **it stands in front of the gate and not behind it.**
//
// What the limiter counts is arithmetic and is a table of cases beside it
// (`src/lib/mcp/rate-limit.test.ts`). What matters at this seam is the order: a caller
// with no token at all must run out of requests, because that is the caller the limit
// exists for. A limiter placed after the gate would refuse them 401 for ever, cheerfully,
// as fast as they could ask.
describe("the rate limit in front of the gate", () => {
  /** One address, asking far more than its allowance, and never with a token. */
  async function flood(client: string, requests: number): Promise<number[]> {
    const statuses: number[] = [];
    for (let n = 0; n < requests; n += 1) {
      statuses.push((await POST(post(undefined, undefined, client))).status);
    }
    return statuses;
  }

  it("runs out of requests for a caller who never presents a token", async () => {
    const statuses = await flood("203.0.113.11", PER_CLIENT + 5);

    expect(statuses.slice(0, PER_CLIENT)).toEqual(Array(PER_CLIENT).fill(401));
    expect(statuses.slice(PER_CLIENT)).toEqual(Array(5).fill(429));
  });

  it("tells the caller how long to wait", async () => {
    await flood("203.0.113.12", PER_CLIENT);
    const response = await POST(post(undefined, undefined, "203.0.113.12"));

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    // And nothing about the gate leaks out of a 429: it is refused before the token is
    // ever looked at, so there is no `www-authenticate` to answer with.
    expect(response.headers.get("www-authenticate")).toBeNull();
  });

  // The owner's own assistant is subject to the same limit. Stated as a case because the
  // alternative — exempting a correct token — would put the SHA-256 back in front of the
  // limiter and undo the whole point of the order.
  it("counts the owner's own requests too", async () => {
    await flood("203.0.113.13", PER_CLIENT);

    expect((await POST(post(`Bearer ${TOKEN}`, undefined, "203.0.113.13"))).status).toBe(429);
  });

  it("does not charge one caller's flood to another", async () => {
    await flood("203.0.113.14", PER_CLIENT + 20);

    expect((await POST(post(`Bearer ${TOKEN}`, undefined, "203.0.113.15"))).status).toBe(200);
  });
});
