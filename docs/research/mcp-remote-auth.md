# Authenticating a remote MCP server for ChatGPT and Claude

Research run 2026-08-28. Question: how do you authenticate a remote MCP server that ChatGPT and Claude connect to, and — for a single-owner personal app (one human, one Google identity, server reachable over the public internet) — is there a shortcut around standing up a full OAuth authorization server?

---

## Answer

**There is a real shortcut, and it differs sharply by client:**

- **Claude (claude.ai / Claude Desktop custom connectors, the Claude API's MCP connector, and Claude Code) all accept a static bearer token/API key as a first-class, documented option.** For claude.ai/Desktop you type it into a "Request headers" field when adding the custom connector — no OAuth server, no DCR, no metadata endpoints required. For the Claude API and Claude Code you literally pass `Authorization: Bearer <token>` yourself; Anthropic's client performs zero discovery. This is the closest thing to "no auth server needed" you'll get from either vendor.
- **ChatGPT is stricter for the mainstream "Connectors" surface used inside the chat app**: OpenAI's own developer docs for building an MCP server that plugs into ChatGPT as a connector/plugin say plainly "you are expected to implement an OAuth 2.1 flow that conforms to the MCP authorization spec" — no static-token option is documented there ([Authentication – Plugins](https://developers.openai.com/plugins/build/auth)). Multiple consistent secondhand reports say the "Create connector" UI itself offers None / API Key / OAuth radio buttons, matching the sibling "GPT Actions" framework's three schemes ([GPT Action authentication](https://developers.openai.com/api/docs/actions/authentication)), but this session could not get a primary-source confirmation of that specific UI (ChatGPT's help center blocks automated fetches — see Open Questions). If **you instead build your own app against the Responses API** (the developer/API surface, not the ChatGPT chat product), a static bearer token absolutely works: the `mcp` tool's `headers` field is passed through verbatim to your server, "API key, OAuth token, etc." ([MCP tool guide](https://developers.openai.com/cookbook/examples/mcp/mcp_tool_guide), [MCP and Connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)).
- **Even where a static token is accepted, the MCP spec's `WWW-Authenticate`/401 mechanics are still worth implementing** because they're what lets a client discover *that* it needs a token at all — but you do not need a real authorization server, token endpoint with a login screen, or Dynamic Client Registration behind it. A resource server that checks one hardcoded secret is spec-legal.
- **Biggest surprise:** the MCP specification's "current" revision, dated **2026-07-28**, is a near-total rewrite of the transport/session model since **2025-06-18** (stateless protocol, no `initialize` handshake, DCR itself now *deprecated* in favor of an IETF draft called Client ID Metadata Documents). Both ChatGPT's and Claude's own docs still point to **2025-11-25** or earlier as "the" authorization spec they implement. Building strictly to today's bleeding-edge spec text would over-engineer for clients that haven't caught up — build to what the clients actually document, not to `2026-07-28`.

---

## 1. MCP specification's current authorization mandate

**Org/repo, verified:** the spec text and docs are published from `github.com/modelcontextprotocol/modelcontextprotocol` (schema + docs, Mintlify site at modelcontextprotocol.io); the changelog page's own diff link points at a *separate* repo, `github.com/modelcontextprotocol/specification` (compare `2025-11-25...2026-07-28`), suggesting the spec has been split out of the monorepo during a governance restructuring. Authorization *extensions* live in yet another repo, `github.com/modelcontextprotocol/ext-auth`. Verify the split before relying on any single repo for automation.

**Current revision:** **2026-07-28** ("Current" status), superseding 2025-11-25, which superseded 2025-06-18, which superseded 2025-03-26 ([Versioning](https://modelcontextprotocol.io/specification/versioning)).

**Overview from the [2026-07-28 authorization page](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization):**

- Authorization is **OPTIONAL** overall for MCP implementations; HTTP-transport implementations that do support it **SHOULD** conform to this spec; stdio implementations **SHOULD NOT** (use env-supplied credentials instead).
- Authorization servers **MUST** implement OAuth 2.1 (`draft-ietf-oauth-v2-1-13`).
- Authorization servers and MCP clients **SHOULD** support **OAuth Client ID Metadata Documents** (CIMD, `draft-ietf-oauth-client-id-metadata-document-00`) — this is new since 2025-11-25 and is now the *preferred* client-registration mechanism.
- Authorization servers and MCP clients **MAY** (downgraded from SHOULD) support **Dynamic Client Registration** (RFC 7591) — explicitly flagged: *"Dynamic Client Registration is deprecated and retained for backwards compatibility with authorization servers that do not support Client ID Metadata Documents."*
- MCP servers **MUST** implement **OAuth 2.0 Protected Resource Metadata** (RFC 9728); MCP clients **MUST** use it for AS discovery.
- MCP authorization servers **MUST** provide at least one of **RFC 8414** (AS Metadata) or **OpenID Connect Discovery 1.0**; MCP clients **MUST** support both discovery mechanisms.
- Newly normative in this revision: **RFC 9207** (Authorization Server Issuer Identification) — ASes SHOULD send `iss` in the auth response; clients MUST validate it against the recorded issuer before redeeming a code. Spec text says a *future* revision is expected to upgrade this from SHOULD to MUST.
- **RFC 8707** (Resource Indicators): MCP clients **MUST** send a `resource` parameter (canonical server URI, no trailing slash preferred) in both authorization and token requests, regardless of AS support; MCP servers **MUST** validate token audience against RFC 8707 §2.
- **PKCE** (OAuth 2.1 §7.5.2, which folds in RFC 7636): MCP clients **MUST** implement it.
- Bearer usage: **RFC 6750** is now cited normatively too (new since 2025-06-18) — servers SHOULD put a `scope` parameter on the `WWW-Authenticate` 401/403 challenge.

**Client registration priority order** (new [Client Registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration) page), clients SHOULD follow in order: (1) pre-registered client info if the client already has it, (2) CIMD if the AS advertises `client_id_metadata_document_supported`, (3) DCR as fallback if the AS exposes `registration_endpoint`, (4) prompt the human to enter client info manually. **Pre-registration is explicitly a first-class, spec-sanctioned option** — you are allowed to just hand out one hardcoded client ID.

**What changed 2025-11-25 → 2026-07-28** ([Key Changes](https://modelcontextprotocol.io/specification/2026-07-28/changelog)), auth-relevant items only:
- DCR reclassified Deprecated (kept for back-compat only); CIMD introduced as the SHOULD-level replacement.
- RFC 9207 `iss`-validation requirement added (SEP-2468).
- `application_type` now required during DCR to avoid OIDC redirect-URI conflicts (SEP-837).
- Client credentials now explicitly bound to the issuing AS: MUST be keyed by issuer, MUST NOT be reused across ASes, MUST re-register on AS change (SEP-2352).
- HTTP+SSE transport reclassified from informally-deprecated to formally **Deprecated** under a new governance policy (SEP-2596).
- Unrelated but large: the entire session/handshake model was rewritten — `initialize`/`initialized` removed, protocol is now stateless per-request (`_meta` carries version/capabilities on every call), a mandatory `server/discover` RPC replaces version negotiation via handshake, `Mcp-Session-Id` and SSE resumability (`Last-Event-ID`) removed. **No client in this research (ChatGPT or Claude) documents support for this stateless model** — see §2.

**Prior revision text (2025-06-18), for contrast:** OAuth 2.1, RFC 8414, RFC 7591, RFC 9728 only; DCR was SHOULD (not yet deprecated); no CIMD, no RFC 9207, no RFC 6750 citation. This is the version most currently-shipping SDKs and client integrations were actually built against.

---

## 2. Transport

- **Streamable HTTP is current/recommended**; the old **HTTP+SSE transport has been deprecated since protocol version `2025-03-26`** and, as of **2026-07-28**, is formally listed in the spec's [Deprecated Features Registry](https://modelcontextprotocol.io/specification/2026-07-28/deprecated) under the new 12-month feature-lifecycle policy ([Transports overview](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports), [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)).
- Streamable HTTP: single MCP endpoint, POST-based, replies as JSON or a request-scoped SSE stream (2026-07-28 revision also strips protocol-level sessions, `Mcp-Session-Id`, and SSE resumability from it — a further break from 2025-06-18's Streamable HTTP).
- **Client reality (client docs, not spec docs) as of 2026-08-28:**
  - **Claude** (API MCP connector): *"The server must be publicly exposed through HTTP (supports both Streamable HTTP and SSE transports)"* — still accepts the deprecated SSE transport today ([MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)).
  - **Claude Code**: supports `--transport http` (Streamable HTTP, documented as *"the recommended option... most widely supported transport"*), `--transport sse` (documented in Claude Code's own CLI help as deprecated — *"Use HTTP servers instead, where available"*), and a non-MCP-spec `ws` (WebSocket) transport for servers that push unprompted events (header-auth only, no OAuth) ([Claude Code MCP docs](https://code.claude.com/docs/en/mcp)).
  - **ChatGPT / OpenAI Responses API**: *"The Responses API works with remote MCP servers that support either the Streamable HTTP or the HTTP/SSE transport protocols"* — both accepted, no deprecation warning surfaced in OpenAI's own docs ([MCP and Connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)).
- **Practical takeaway:** build Streamable HTTP as primary (it's what the spec calls current and both vendors support it), but neither vendor's docs currently *require* dropping SSE — you won't be locked out for lacking Streamable HTTP-only compliance either way, in per-vendor docs current as of this research.

---

## 3. What ChatGPT requires (OpenAI's own docs)

Two materially different surfaces exist; conflating them is the most common mistake:

**A. Responses API `mcp` tool (developer builds their own app/agent against the API)** — [Building MCP servers for plugins and API integrations](https://developers.openai.com/api/docs/mcp), [MCP and Connectors guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp), [MCP tool guide (cookbook)](https://developers.openai.com/cookbook/examples/mcp/mcp_tool_guide):
- Tool config: `type: "mcp"`, `server_label`, `server_url`, `allowed_tools`, `require_approval`, plus a `headers` object.
- **No auth is required by OpenAI's platform.** The `headers` field is opaque — *"the runtime calls the server's `tools/list`, passing any headers you provide (API key, OAuth token, etc.)"* — meaning **a static bearer token/API key works today, with zero OAuth, zero DCR, zero well-known endpoints**, because the developer's own code is the one holding and injecting the credential; OpenAI's infrastructure is not performing any discovery or token exchange on your behalf. Cookbook confirms: *"OAuth client registration and authorization must be handled separately by your application."*
- Approval: reads/`search`/`fetch`-only tools can set `require_approval: "never"`; write/consequential tools should keep approval on (explicit recommendation in docs, not enforced by the API for custom servers).
- Transport: Streamable HTTP or HTTP/SSE, either accepted (§2).

**B. ChatGPT product "connectors"/"apps" (the chat UI surface, Settings → Connectors, and the publishable Apps/Plugins framework)** — [Authentication – Plugins](https://developers.openai.com/plugins/build/auth), [Build an MCP server – Plugins](https://developers.openai.com/plugins/build/mcp-server):
- *"For an authenticated MCP server, you are expected to implement an OAuth 2.1 flow that conforms to the MCP authorization spec."* No static-token or no-auth option is documented on this page for authenticated servers (anonymous/read-only access is mentioned as a distinct, separate mode, not as an auth *scheme* choice for a protected server).
- Client registration: CIMD preferred (*"ChatGPT uses an HTTPS metadata URL as its stable client identity"*, supporting `none` or `private_key_jwt` token-endpoint auth); **DCR is optional but automatic** when CIMD isn't advertised — *"ChatGPT runs DCR once per MCP server connection, then keeps and reuses the registered OAuth client."* Practically: **you do not need to hand ChatGPT a pre-registered client_id** — it will self-register via CIMD or DCR either way. But you (the server) must still stand up a real OAuth 2.1 authorization server capable of one of those flows.
- Server must: support Streamable HTTP at a stable URL (typically ending `/mcp`); implement `search`/`fetch` tool schemas and `readOnlyHint: true` for other read tools (required specifically for the "company knowledge"/plugin-review eligibility path, not stated as mandatory for a purely private connector); enforce authorization itself on every request (*"never rely on the model to decide whether a user has access"*); remain reachable for **domain verification** as an ongoing requirement for public/plugin listings.
- Also documented: **mTLS** as an alternate mechanism — *"Use OpenAI-managed mTLS to authenticate ChatGPT as the MCP client"* — for unauthenticated-to-ChatGPT-but-still-verified server-identity scenarios; and a separate **Secure MCP Tunnel** product for connecting a private/on-prem MCP server to ChatGPT without exposing it publicly at all (not applicable here since the server must be public anyway, but notable as an alternative to public exposure).
- **Unresolved / secondhand only:** multiple independent write-ups (not usable as primary citations, and OpenAI's help center at `help.openai.com` returned HTTP 403 to automated fetches all session, so this could not be verified against primary text) claim the actual "Create connector" dialog in ChatGPT Settings offers three radio options — **None / API Key / OAuth** — mirroring the older "GPT Actions" framework's three schemes, which *is* primary-sourced: *"We support flows without authentication... We allow API key authentication through the GPT editor UI... Actions allow OAuth sign in for each user"* ([GPT Action authentication](https://developers.openai.com/api/docs/actions/authentication)). That page is explicitly about GPT Actions, a distinct legacy framework, and does not claim to describe MCP connectors. Treat "ChatGPT's connector UI accepts a static API key" as **plausible but not confirmed from a primary MCP-specific source**.
- Connectors vs remote MCP servers (API distinction): OpenAI-maintained **Connectors** (Dropbox, Gmail, Google Calendar/Drive, MS Teams, Outlook Calendar/Mail, SharePoint) are referenced via `connector_id` + an OAuth token *your app* already obtained; **remote MCP servers** are anything else, referenced via `server_url`.

---

## 4. What Claude requires (Anthropic's own docs)

Three surfaces, meaningfully different requirements:

**A. claude.ai / Claude Desktop "Custom connectors" (the consumer/workspace chat product)** — [Get started with custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), corroborated by [Build custom connectors via remote MCP servers](https://support.claude.com/en/articles/11503834-build-custom-connectors-via-remote-mcp-servers) (page content via search snippet only — direct fetch returned 404 to automated access; treated as lower-confidence primary but consistent with the article that *did* load):
- Available on **Free, Pro, Max, Team, and Enterprise** plans (Free limited to one custom connector). Added via Customize → Connectors (individual) or Organization settings → Connectors (Team/Enterprise owner).
- **Authless (no auth) servers are explicitly supported**: *"Authless remote MCP servers are supported, and they are useful while you are shaping tools and resources. Without auth, Claude does not send your application's user ID to the MCP server."*
- **Static credentials are explicitly supported via a "Request headers" section**: *"If your MCP server authenticates with an API key, bearer token, or other fixed credential instead of OAuth, you can configure it in the Request headers section."* This is presented as an equal, first-class alternative to OAuth, not a fallback.
- OAuth is also supported, with an "Advanced settings" panel to specify a pre-registered **OAuth Client ID and Client Secret** — i.e., you can hand Claude a fixed client_id rather than relying on DCR/CIMD.
- Anthropic's docs name specific auth-type identifiers for remote MCP servers — `oauth_cimd` and `oauth_dcr` — recommending them ("start with") for *production* connectors, implying authless/static-header setups are considered acceptable for lower-stakes/personal use.
- Security note called out explicitly: never pass tokens as URL query parameters (log/proxy/browser-history leakage risk) — use headers or OAuth instead.

**B. Claude API — Messages API MCP connector** — [MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector):
- **Status: Beta.** Current beta header **`mcp-client-2025-11-20`** (prior `mcp-client-2025-04-04` is deprecated, migration documented). Available on Claude API and Claude Platform on AWS (beta), Microsoft Foundry (beta); **not available on Amazon Bedrock or Google Cloud**. **Not eligible for Zero Data Retention (ZDR).**
- Config shape: `mcp_servers: [{ type: "url", url, name, authorization_token }]` + a `tools: [{ type: "mcp_toolset", mcp_server_name, default_config, configs }]` entry (the previous version embedded tool config directly on the server object — now deprecated).
- `authorization_token` is **just a string you supply** — *"API consumers are expected to handle the OAuth flow and obtain the access token prior to making the API call, and to refresh the token as needed."* Anthropic's API performs **no discovery, no DCR, no metadata fetch** — it just forwards whatever you put in that field as a bearer token. **A static token you mint yourself works exactly as well as a real OAuth access token from this API's point of view.**
- Server requirement: publicly exposed over HTTP, Streamable HTTP or SSE; only tool calls are supported (not resources/prompts/roots via this connector — use the client-side SDK helpers for those).
- Doc's own authorization reference link points at **`modelcontextprotocol.io/specification/2025-11-25/basic/authorization`** — i.e., Anthropic's current, non-deprecated API docs cite the 2025-11-25 spec revision, not 2026-07-28.

**C. Claude Code** — [MCP docs](https://code.claude.com/docs/en/mcp):
- Most permissive of all three surfaces. Supports, side by side: no auth at all (`claude mcp add --transport http notion https://mcp.notion.com/mcp`); static header auth of any kind (`--header "Authorization: Bearer <token>"`, `--header "X-API-Key: <key>"`, or a raw JSON config with a `headers` map, including `${ENV_VAR}` expansion); a `headersHelper` script for dynamic/short-lived credentials (Kerberos, SSO, etc.); and full OAuth with **DCR on by default** (RFC 7591, "no pre-configuration needed — simply run `/mcp`"), with pre-registered `--client-id`/`--client-secret` as a fallback for servers that reject DCR, and a custom `authServerMetadataUrl` override for non-standard discovery. A WebSocket transport variant exists that is header-auth-only (no OAuth sign-in support at all over `ws`).
- Tokens are cached/refreshed automatically, stored in the OS keychain (macOS) or a credentials file.

---

## 5. The single-user shortcut — verdict per client

| Client / surface | Static bearer token accepted? | Minimal hand-rolled OAuth (skip full DCR + real login UI) sufficient? | What the server must still implement |
|---|---|---|---|
| **Claude.ai / Claude Desktop custom connectors** | **Yes**, first-class ("Request headers" section), explicitly positioned as equal to OAuth | N/A — not needed | Nothing beyond checking the header value yourself. No `.well-known` endpoints required for authless/static-header mode. |
| **Claude API (Messages API MCP connector)** | **Yes** — `authorization_token` is opaque, dev-supplied, no discovery performed by Anthropic | N/A — you can literally hand it a permanent string | Nothing; you own token issuance and validation entirely. |
| **Claude Code** | **Yes** — `--header` flag or `headers` map, or no auth at all | Yes if you want OAuth: DCR is on by default so you don't even need CIMD/pre-registration, but a bare static header is simpler still | Nothing extra for header/no-auth mode. |
| **ChatGPT — Responses API `mcp` tool** | **Yes** — `headers` field is passed through opaquely by OpenAI's runtime | N/A | Nothing; same shape as Claude's API connector — your own app code holds the token. |
| **ChatGPT — chat-product "Connector"/"App" (Settings UI, or public Apps/Plugins listing)** | **Not confirmed** by primary OpenAI docs for *authenticated* MCP connectors — the primary text found says *"you are expected to implement an OAuth 2.1 flow that conforms to the MCP authorization spec."* Secondary sources (uncited-grade) claim a None/API-Key/OAuth trio exists in the actual UI, matching the older GPT-Actions framework, but this session could not verify it against a primary MCP-specific source (help.openai.com blocked automated fetches). **Treat as: full OAuth 2.1 authorization server required, unless you can verify the API-Key toggle yourself in the live UI.** | If OAuth is required: DCR is *not* mandatory to hand-configure — ChatGPT will self-register via CIMD or, failing that, DCR automatically, so you don't need to give it a client_id up front. But you still need a real OAuth 2.1-conformant authorization server: authorization endpoint, token endpoint, PKCE support, and (per the general MCP spec, which ChatGPT says its servers must conform to) RFC 9728 protected-resource metadata + an AS metadata document. | If OAuth path: `/.well-known/oauth-protected-resource` (you, the resource server), an authorization endpoint + token endpoint conforming to OAuth 2.1 + PKCE, either RFC 8414 or OIDC discovery metadata, and CIMD or DCR support so ChatGPT can self-register. No "real" login *screen* is mandated by spec text — since this is single-user, your "authorization UI" can be a single hardcoded auto-approve, as long as the OAuth *protocol* mechanics (codes, PKCE, token issuance, audience-bound tokens) are real. |

**Bottom line for this project:** if the author is willing to have the human interact with the server through the **Claude** surfaces (claude.ai, Claude API, or Claude Code) and/or through **ChatGPT via a self-built Responses-API app**, a static bearer token is enough — no authorization server needed at all, just an `if token != SECRET: 401` check. The one surface where the shortcut is *not* confirmed is **ChatGPT's native chat-app "Connector"** — if that specific surface matters, either (a) verify live in the ChatGPT UI whether "API Key"/"None" are offered for a custom MCP connector today, or (b) budget for a minimal real OAuth 2.1 authorization server (a token endpoint that always issues the same long-lived token to the one owner-account after a trivial/auto-approved consent step, plus RFC 9728 + RFC 8414 metadata, satisfies the letter of both the MCP spec and ChatGPT's documented requirement, without needing a multi-user login system or genuine DCR admin flow).

---

## 6. Minimal compliant server checklist (if you do implement OAuth)

Per the [2026-07-28 authorization spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) (mirrors 2025-06-18/2025-11-25 on these core points; CIMD/RFC 9207 are the deltas):

- **Resource server (your MCP server) MUST:**
  - Serve `/.well-known/oauth-protected-resource` (RFC 9728) with an `authorization_servers` array naming at least one AS (may be itself, co-hosted, or a separate service).
  - On an unauthenticated/invalid-token request, return **HTTP 401** with a `WWW-Authenticate: Bearer` header carrying `resource_metadata="<url to the protected-resource metadata>"` (RFC 9728 §5.1) — and, per 2026-07-28, SHOULD also carry a `scope="..."` hint.
  - Return **403** for valid-token-but-insufficient-scope (`error="insufficient_scope"`, `scope=`, `resource_metadata=`), **400** for malformed auth requests.
  - Validate every incoming access token's **audience** claim against RFC 8707 §2 — reject tokens not specifically issued for this server; **never** pass through a token you received to a downstream API unmodified (confused-deputy prevention).
  - Require `Authorization: Bearer <token>` on every request (no query-string tokens).
- **Authorization server (may be the same process or separate) MUST:**
  - Implement OAuth 2.1 (PKCE included) for both confidential and public clients.
  - Serve **either** `/.well-known/oauth-authorization-server` (RFC 8414) **or** OIDC Discovery (`/.well-known/openid-configuration`) — MCP clients are required to try both.
  - Support the `resource` parameter (RFC 8707) on authorization and token requests, and bind issued tokens to that resource in the `aud` claim.
  - Pick a client-registration story: CIMD (SHOULD, preferred going forward), DCR (MAY, legacy/back-compat), and/or pre-registration (a single hardcoded client_id is explicitly spec-legal and is the simplest option for a one-user server).
  - Serve HTTPS-only endpoints; redirect URIs must be `localhost` or HTTPS.
- **Nothing in the spec mandates a "real" multi-user login screen** — for a single-owner server, the authorization endpoint can auto-consent the one known Google identity (or even skip an interactive prompt entirely) and still be spec-conformant, as long as the token/audience/PKCE/discovery mechanics above are genuinely implemented.
- **If you take the static-bearer-token shortcut instead** (viable today for every surface except possibly ChatGPT's native connector UI, per §5): none of the above is required. No well-known endpoints, no token endpoint, no audience claims — just check a shared secret on every request over HTTPS.

---

## Open questions

1. **Does ChatGPT's own "Create connector" UI (Settings → Connectors, in-app, non-Plugin/App-store path) offer a "No authentication" / "API Key" option for a custom remote MCP server, alongside OAuth?** Multiple non-primary sources say yes; OpenAI's primary developer docs found in this research only describe the OAuth-required path for the Apps/Plugins framework and did not surface a definitive statement either way for the plain in-app connector flow. `help.openai.com` (OpenAI's help center, likely home to the definitive consumer-facing answer) returned HTTP 403 to every automated fetch attempt this session — this needs a manual check of the live ChatGPT UI or a logged-in fetch.
2. **Exact current relationship between `github.com/modelcontextprotocol/modelcontextprotocol` and `github.com/modelcontextprotocol/specification`** — the changelog page's diff link points at the latter, implying a repo split, but this wasn't independently confirmed (e.g., via a repo README stating the split explicitly). Confirm before scripting anything against either repo (e.g., watching for spec changes via GitHub Actions).
3. **Whether ChatGPT/OpenAI's Responses API or connector infrastructure has adopted anything from the MCP `2026-07-28` stateless/no-`initialize` redesign, or from CIMD.** No date/version marker for MCP protocol compliance was found anywhere in OpenAI's docs (their pages describe request/response shapes but never cite a spec revision date the way Anthropic's docs do). Anthropic's current, non-deprecated API docs cite `2025-11-25`. Neither vendor's docs reference `2026-07-28` at all — practically, that revision should probably be treated as "not yet relevant to production interop" for now, but this is an inference from absence of citation, not a confirmed statement from either vendor that they intentionally lag.
4. **Whether Anthropic's "Build custom connectors via remote MCP servers" article** (`support.claude.com/en/articles/11503834-...`) **states a hard requirement list** (e.g., does it mandate RFC 9728 metadata even for authless servers?) — this page 404'd on every direct fetch attempt in this session; findings under §4A/§5 for that specific article are sourced from a web-search snippet quoting it, not a direct primary read, and should be re-verified with a browser-based fetch if precision matters.
