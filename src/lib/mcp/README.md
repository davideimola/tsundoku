# The MCP door

The other door over the same core. The web view is a set of pages; this is one route
handler at `/mcp`, and both are **thin adapters over `src/core`** with no domain logic of
their own (ADR-0002). MCP read is a first-class product surface here rather than an
integration bolted on at the end: the app is judged on how legible the collection is from
outside.

```
src/app/mcp/route.ts     the door: the limit, the gate, the framing, then a response
src/lib/mcp/
├── bearer.ts            the gate. Environment in, verdict out, and pure
├── rate-limit.ts        what stands in front of the gate, and the only thing that remembers
├── protocol.ts          JSON-RPC and the four methods. Knows nothing about the model
├── tool.ts              what one tool is
├── tools.ts             the directory *is* the tool list — see below
└── tools/               one file per area
    ├── story.ts         what the owner has read
    ├── collection.ts    what is on the shelf
    └── finder.ts        one word, and everything in the library called it
```

## Exposing a query over MCP is one new file

**Add `src/lib/mcp/tools/<area>.ts`. Do not edit the route, do not edit `tools.ts`, and
there is no barrel to add a line to.** Every file in `tools/` is discovered and mounted,
which is the same argument `src/core/README.md` makes for having no `index.ts`: several
slices are each meant to expose their own query over this door, and a list somebody has to
edit is a file every one of them conflicts in.

The file default-exports its tools, and that is the whole contract:

```ts
import { missingVolumes } from "@/core/queries/series";
import type { McpTool } from "../tool.ts";

const missing: McpTool = {
  name: "series_missing",
  title: "What is missing from the Series being collected",
  description: `The Volumes of every Series the owner has decided to collect that are not in the house yet. …`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { series: await missingVolumes() };
  },
};

export default [missing];
```

An argument is read with `stringArgument(input, "title")` from `../tool.ts`, and that is
the whole of reading one — see `tools/collection.ts`. Declare it in `inputSchema` with
prose of its own, because the schema is what the assistant fills in.

Five rules, and they are all the review surface there is:

1. **One file per area, named for the area** in the vocabulary of `CONTEXT.md` —
   `series.ts`, `path.ts`, `reading-list.ts`, `wish.ts`, `inbox.ts` — never for a layer.
   Several tools in one file is normal; the same area in two files is not. A file whose
   name has a second dot is not mounted, so a test may sit beside an area.
2. **The tool calls a query or a verb and returns what it got.** No SQL, no `if` about the
   model, no reshaping. If the web view would need the same thing, it belongs in
   `src/core` where both doors reach it — that is what makes one test seam cover both.
3. **`name` is `area_question`, lower_snake_case**, matching the file: `stories_read`,
   `collection_search`, `series_missing`. A client listing thirty tools then lists them
   grouped. `finder_search` is the one area that is not an entity: it answers across all of
   them, which is why it is its own file rather than a sixth tool in one of theirs, and why
   the query under it is `src/core/queries/finder.ts` rather than a question added to an
   area's.
4. **`description` is product, not a label.** It is what an assistant reads when deciding
   which tool answers the owner's question, so it says what the thing *is* in the owner's
   vocabulary and what it deliberately is not — a Story is not a book, a Rating is never
   of a Volume, a Volume on the shelf says nothing about having read it. A tool described
   as "list series" gets called for the wrong question.
5. **`readOnly` means it.** A read tool a client may call without interrupting the owner;
   a verb that writes says `false`. See the write boundary below before adding one. A write
   that takes something away which cannot be put back also says `destructive: true` — the
   question is what is *gone* afterwards, not whether the owner can undo it with a second
   verb, and `tool.ts` has the three worked examples. Saying nothing means not destructive,
   which is the opposite of what the protocol assumes, so the door states all three hints on
   every tool rather than letting a default answer for you.

## The write boundary

This door writes, and **where it may write is not a matter of taste** (ADR-0005). Two rules,
and they are the whole of it:

- **A verb on an entity that already exists is called directly.** Record a Reading, set a
  Rating, acquire a Volume, release a Volume, open a Wish, close a Wish. They are narrow,
  reversible and wrong in an obvious way, and keeping them fluid is the point — *"I finished
  volume 23, I'd give it an 8"*, said out loud, is the flow this whole app was built for.
- **Creating a Story, a Volume or a Series is impossible from here.** There is no
  `stories_create`, no `collection_catalogue` and no `series_declare`, and there must not be
  one: a hallucinated title or a fabricated edition becomes a permanent duplicate in a
  library kept for years. The three `inbox_propose_story|volume|series` tools are the whole of
  what an assistant can do about it, and the owner approving the entry is what creates the
  entity.
- **Completing or correcting one of those three is impossible from here too** (ADR-0011).
  Nothing writes a field onto a record that exists: an ISBN, a publisher, a Type, a
  published count all go through `inbox_propose_amendment` and wait, because a wrong one is
  silent, is never read back, and stands for as long as the record does. The fields an
  amendment may name are `AMENDABLE_FIELDS` in `src/core/verbs/inbox.ts` and the tool reads
  its lists out of it, so the door offers exactly what the verb accepts.

**A tool that proposes says two things, and it says them from one place.** *Search first, with
the tool to search with named*, and *what a wrong proposal costs the owner* — `SEARCH_FIRST` and
`WHAT_A_WRONG_ONE_COSTS` in `tools/inbox.ts`, spent by all four rather than written out again
per tool. The door had every read tool needed to avoid a duplicate and assistants proposed them
anyway (#53): the gap was the prose, and a fifth proposing tool wording it its own way reopens
it. `AGENTS.md` states the same rule beside the others.

Two consequences for anyone adding a tool:

- **A verb that creates an entity does not get a tool, and the exception took an ADR.** If the
  thing you want to expose writes a row nothing else could have written, it belongs behind the
  Inbox; moving that line either way — a fourth kind of entity behind it, or an entity taken out
  from behind it — is a decision for an ADR rather than for a tool file. There is exactly one
  entity minted from out here, a **Person**, by `credit_attribute`, and
  [ADR-0012](../../../docs/adr/0012-a-credit-is-attributed-directly-and-mints-its-person.md) is
  what allows it. The risk that decision accepts, and the prose the tool carries in place of a
  boundary, are at the top of `src/core/verbs/credit.ts`.
- **The verb's own refusal is the boundary you are relying on.** `openWish` refuses a Volume
  that does not exist rather than creating one, and that refusal is what makes `wish_open`
  safe to expose. A tool over a verb that would create-on-write is not.

### A refusal is already handled

Do not catch one. A verb that the database refuses throws a `Refusal` carrying a stable
code and prose (`src/core/refusal.ts`), and `protocol.ts` turns it into a tool result with
`isError`, the prose as its text, and the code under
`_meta["tsundoku/refusal"]` — the prose because the assistant relays it to the owner, the
code because an assistant that reads `already-exists` can try something else where it
would only re-guess at prose. Anything that is not a `Refusal` becomes an internal error
with no prose invented for it.

### How the directory becomes the list

`tools.ts` asks the application's bundler for a context module over `tools/`, resolved at
build time. Verified against `next dev` and against a production `next build`.

It is deliberately **not** a filesystem read: the source tree is not shipped, so a
`readdir` would work in development and find nothing in the container. It therefore also
does not work outside the bundler, which is why the door's own test asks for `initialize`
and never for `tools/list`. That costs nothing — the adapters need no tests of their own
(ADR-0002), and what a tool answers is Seam 1's business, tested beside the query it
calls.

### Adding a file does not mean a client sees it

**A new tool is invisible to ChatGPT until its connector is added again**, however long ago
it deployed. Verified the hard way on 2026-08-31: three tools shipped —
`credit_attribute`, `inbox_propose_amendment`, `finder_search` — and ChatGPT went on
listing the thirty-two it had photographed the evening before, while writing perfectly
happily through the older verbs. Claude over the Ingress had all thirty-five the same day.

Nothing here is broken, and the cause is one line: `initialize` answers
`capabilities: { tools: { listChanged: false } }`, which is the truth — this is a stateless
door with no stream, so there is no channel to push `notifications/tools/list_changed` down
and declaring one would be a lie. The consequence is that **a client that photographs the
list has no signal to take another photograph**, ever. It refetches when it is made to.

So, after deploying a new tool, in this order:

1. **restart the tunnel client** — `kubectl -n tunnel-client rollout restart
   deploy/tunnel-client` on the cloud Cluster, because that daemon registers its channel
   with OpenAI's control plane at startup and only at startup;
2. **remove and re-add the connector** in ChatGPT. "Refresh" does not refetch.

Inverting the two hides which one worked. The count to check against is
`grep -h '^  name: "' src/lib/mcp/tools/*.ts | wc -l`, and the fastest way to see what the
door itself is serving — rather than what a client remembers — is `tools/list` over curl
with the bearer, as under **Trying it** below.

The symptom lies convincingly, which is the reason this section exists: an assistant that
writes fine while missing a *write* tool looks exactly like a client filtering on
`readOnlyHint`, or like a deploy that never landed. Ask it whether it can see a **read-only**
tool you shipped at the same time. If that is missing too, it is an old list and nothing else.

## The gate

`/mcp` is authenticated by a **static bearer token** and not by Google (ADR-0004). A
redirect to a consent screen is not an answer an assistant can read, so `src/proxy.ts`
excludes this path from the Google matcher by name — which means `bearer.ts` is the only
thing standing in front of the library here.

- It **fails closed**: with `MCP_BEARER_TOKEN` unset or blank, every request is refused.
  There is no development opt-in beside it, unlike the owner gate: that one exists because
  there is no Google OAuth client to create yet, whereas a bearer token is a string the
  owner picks, so there is nothing for an opt-in to stand in for. Locally, put any string
  in `.env.local`.
- Tokens are compared **in constant time**, on SHA-256 digests of both sides. `===` on
  strings returns at the first differing byte and the time it took answers *"how much of
  the token did I guess?"*; digesting first is what lets the comparison be
  length-blind as well, because `timingSafeEqual` refuses buffers of different lengths and
  the refusal itself would leak the configured token's length.
- Every refusal is the same 401 with the same body. Which mistake it was is logged for the
  owner and never returned.
- `WWW-Authenticate: Bearer realm="tsundoku"` names no `resource_metadata`: that is how a
  client discovers an authorization server, and there is none. A static bearer is a
  documented, first-class option for Claude's custom connectors, the Claude API's MCP
  connector and Claude Code (`docs/research/mcp-remote-auth.md`), which is the whole
  reason no OAuth 2.1 server is built here. ChatGPT's in-app connector is the one surface
  where that shortcut is unconfirmed, and ADR-0004 defers it deliberately.
- **The rate limit is in front of the gate**, in `route.ts` and immediately before it,
  because this is the only publicly reachable service on the cluster and an endpoint that
  answers a token check to anyone who asks is an endpoint that can be asked forever. The
  order is the whole point: the limiter runs before anything a caller could make expensive,
  the SHA-256 above and the log line beside it included. `rate-limit.ts` is what it counts —
  **two fixed windows of a minute, thirty requests per client and three hundred over the
  whole door** — and a refusal is a 429 carrying `Retry-After` in seconds. Two things about
  it are assumptions rather than details, and both are written at the top of that file: the
  client comes from the leftmost `X-Forwarded-For`, which is sound only because Traefik is
  the only path in, and the counters live in **this process**, which assumes the **single
  replica** the cluster deploys.

## The transport

**Streamable HTTP, statelessly.** One POST carries one JSON-RPC message and gets one JSON
response: no session id, no SSE stream, nothing to resume. The transport permits exactly
that — a server MAY answer a POST with `application/json` rather than a stream — and for a
read door over a database it is the whole of what is needed. Nothing is held between
requests, so the container can restart under a connected assistant without it noticing.

Four methods: `initialize`, `ping`, `tools/list`, `tools/call`. A notification (no `id`)
gets an empty 202; `GET` gets 405, because there is nothing for this server to push. The
revisions it will speak are listed in `protocol.ts`, newest first, and the newest MCP
revision is deliberately absent from that list — it removes `initialize` altogether and no
client documents it yet.

## Trying it

`MCP_BEARER_TOKEN` in `.env.local`, `pnpm dev`, and then:

```sh
curl -s http://localhost:3000/mcp \
  -H "authorization: Bearer $MCP_BEARER_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
```

Without the header it is a 401, which is the other half of Seam 2
(`src/app/mcp/route.test.ts`). The root `README.md` has the Claude Code and custom
connector instructions.
