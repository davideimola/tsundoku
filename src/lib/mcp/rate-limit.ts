// What stands in front of the bearer gate.
//
// `/mcp` is the first publicly reachable service on the cluster (ADR-0004), and an
// endpoint that answers a token check to anyone who asks is an endpoint that can be asked
// forever. So the limiter runs **before** `bearerGate`, not after: a refusal that costs a
// database query, a SHA-256 or even a log line is still a refusal somebody can buy
// millions of.
//
// Shaped like `./bearer.ts` and `@/lib/auth/gate.ts`: a **predicate** the route handler
// asks for a verdict, which knows nothing about status codes or headers. It differs from
// both in the one way it has to — it remembers — and `now` is therefore a parameter rather
// than a clock, which is what keeps the arithmetic a table of cases in
// `rate-limit.test.ts`.
//
// ## Two windows, and why the second one exists
//
// **Per client**, so one caller cannot occupy the door; and **over the whole door**, so a
// caller who rotates addresses cannot either. The second is the one that actually bounds a
// brute force of the token: thirty guesses each from a thousand addresses is thirty
// thousand guesses, and only a ceiling over the total refuses that. It is affordable here
// because the legitimate traffic on this endpoint is one assistant answering one person's
// questions — a number closer to thirty a day than three hundred a minute.
//
// A request already refused by its own allowance is **not** charged to the door. Otherwise
// a single address could spend the whole ceiling and lock the owner's own assistant out,
// which is the flood succeeding by another route.
//
// ## The state is in this process, and that is an assumption
//
// One `Map`, in memory, for the life of the container. **It assumes one replica**, which
// is what `apps/tsundoku/deployment.yaml` in the cluster repo deploys and what the single
// node it runs on affords anyway. Two replicas would each hold their own counters and the
// effective limits would double — wrong, but wrong in the safe direction, and loudly so.
// Anything sharing this across replicas means a Redis this app does not have and does not
// want; the honest fix if a second replica is ever wanted is to say so here first.
//
// A restart forgets the counters. That is a real hole and a small one: a deploy is a
// deliberate act by the owner, and the door reopens with a fresh window rather than
// forgiving anything already refused.

/** How long a window lasts. Fixed rather than sliding — see the tests. */
export const WINDOW_IN_SECONDS = 60;

/** What one caller may ask for in a window. Generous for an assistant, useless for a search. */
export const PER_CLIENT = 30;

/** What everybody together may ask for in a window. The bound on a distributed brute force. */
export const WHOLE_DOOR = 300;

/** The key a request with no proxy in front of it counts against. */
const DIRECT = "direct";

/**
 * How many clients are remembered before the table is swept. Reached only under a flood
 * of invented addresses, which is exactly when it must not be memory the attacker
 * chooses the size of.
 */
const CLIENTS_REMEMBERED = 4096;

/** Whether this request may reach the gate, and how long to wait if not. */
export type RateVerdict = { ok: true } | { ok: false; retryAfterInSeconds: number };

/** A limiter: a client and a moment in, a verdict out. Remembers between calls. */
export type RateLimiter = (client: string, now: number) => RateVerdict;

type Window = { startedAt: number; count: number };

/**
 * Who is calling, as far as this door can tell.
 *
 * The leftmost entry of `X-Forwarded-For` — the address Traefik saw the connection come
 * from, before it appended its own hops. Trusting that header is only sound because
 * Traefik is the **only** path to this endpoint (ADR-0004); reached any other way the
 * value is whatever the caller typed, which is why the ceiling over the whole door exists
 * and does not depend on this being true.
 *
 * With no header at all every caller shares one key. That is deliberately strict rather
 * than deliberately lax: unproxied traffic here is the local loop or something
 * unaccounted for, and neither deserves its own allowance.
 */
export function clientOf(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const leftmost = forwarded?.split(",")[0]?.trim();
  return leftmost || DIRECT;
}

/**
 * A limiter with its own counters.
 *
 * Exported so a test — and only a test — can have one nobody else has touched. The
 * application uses the single `rateLimit` below, because the limit is a property of the
 * door and not of a caller.
 */
export function createRateLimiter(): RateLimiter {
  const clients = new Map<string, Window>();
  const door: Window = { startedAt: Number.NEGATIVE_INFINITY, count: 0 };

  return (client, now) => {
    sweep(clients, now);

    const mine = charge(windowFor(clients, client), PER_CLIENT, now);
    if (!mine.ok) return mine;

    return charge(door, WHOLE_DOOR, now);
  };
}

function windowFor(clients: Map<string, Window>, client: string): Window {
  const existing = clients.get(client);
  if (existing) return existing;

  const fresh: Window = { startedAt: Number.NEGATIVE_INFINITY, count: 0 };
  clients.set(client, fresh);
  return fresh;
}

/**
 * Count one request against a window and say whether it fits, rolling the window over
 * first if the old one has expired.
 */
function charge(window: Window, allowance: number, now: number): RateVerdict {
  if (now - window.startedAt >= WINDOW_IN_SECONDS * 1000) {
    window.startedAt = now;
    window.count = 0;
  }

  if (window.count >= allowance) {
    const remaining = window.startedAt + WINDOW_IN_SECONDS * 1000 - now;
    // Never zero. A client told to retry in no time at all retries immediately, is
    // refused again, and the wait it was given became a busy loop.
    return { ok: false, retryAfterInSeconds: Math.max(1, Math.ceil(remaining / 1000)) };
  }

  window.count += 1;
  return { ok: true };
}

/**
 * Drop the clients whose window has expired, once the table has grown past what a real
 * caller could explain.
 *
 * The keys come from a header, so their number is the attacker's choice and not the
 * owner's — an unbounded map here would be the flood's actual payload. Sweeping only when
 * the table is already large keeps the ordinary path free of it, and clearing outright if
 * every window is still live is the right answer to the only case that reaches it: a flood
 * of addresses nobody will see again.
 */
function sweep(clients: Map<string, Window>, now: number): void {
  if (clients.size <= CLIENTS_REMEMBERED) return;

  for (const [client, window] of clients) {
    if (now - window.startedAt >= WINDOW_IN_SECONDS * 1000) clients.delete(client);
  }

  if (clients.size > CLIENTS_REMEMBERED) clients.clear();
}

/**
 * The limiter the door uses, and the reason there is exactly one of it.
 *
 * A module-level value, so it lives as long as the process and is shared by every request
 * the container serves. See the note at the top about the single replica this assumes.
 */
export const rateLimit: RateLimiter = createRateLimiter();
