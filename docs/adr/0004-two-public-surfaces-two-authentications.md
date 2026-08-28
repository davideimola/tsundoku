# Two public surfaces, two authentications

Both surfaces are **public on a real domain**, behind Traefik and cert-manager: the web UI
is gated by **Google, restricted to one address** (reusing the two-layered owner gate from
`bindex`), and **`/mcp` is authenticated by a static bearer token**. No tunnel is used.

On a VPS there is no NAT to escape, so Cloudflare Tunnel's non-configurable 125-second
proxy read timeout and Tailscale Funnel's `*.ts.net`-only hostnames would be costs with no
benefit ([research](../research/hosting-and-reachability.md)). Keeping the UI inside the
tailnet, as `pantry` does, would also make the Google gate pointless — and being reachable
from a phone in a shop is the point. A static bearer is a documented, first-class option
for Claude's custom connectors, the Claude API's MCP connector and Claude Code
([research](../research/mcp-remote-auth.md)).

## Consequences

- This is the first publicly reachable service on the cluster: `/mcp` gets rate limiting,
  and nothing else is exposed.
- **The ChatGPT OAuth path is deliberately deferred.** OpenAI's developer docs state that a
  connector is expected to implement an OAuth 2.1 flow, and we could not confirm from a
  primary source whether the in-app "Create connector" UI also accepts a plain API key. No
  authorization server is built until a human checks the live UI — building OAuth 2.1 on
  speculation, for one user, would be the most expensive guess in the project.
