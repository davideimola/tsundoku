import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The matcher decides what the first layer of the gate covers, and getting it wrong
// is silent in both directions: one exclusion too many is a page served to anyone with
// the URL, one too few is an endpoint that answers a redirect to Google when something
// fetches it without a cookie.
//
// The pattern is read out of `src/proxy.ts` as text rather than imported: Next requires
// the matcher to be a literal it can evaluate statically, and importing the module
// would drag Auth.js and `next/headers` into a node test for one string.
const PROXY = readFileSync(fileURLToPath(new URL("./proxy.ts", import.meta.url)), "utf8");

function gateCovers(pathname: string): boolean {
  const literal = PROXY.match(/matcher:\s*\[\s*"((?:[^"\\]|\\.)*)"/)?.[1];
  if (!literal) throw new Error("No matcher literal found in src/proxy.ts.");

  // The literal is a source string, so its escapes are still escaped once more.
  const pattern = literal.replace(/\\\\/g, "\\");
  return new RegExp(`^${pattern}$`).test(pathname);
}

describe("the proxy's matcher", () => {
  it("finds the matcher it is about to test", () => {
    expect(() => gateCovers("/")).not.toThrow();
  });

  // Everything the owner looks at, starting with the home page — which is the whole
  // of the web view today and the reason the exclusions have to be a short list.
  it.each(["/", "/collection", "/story/abc", "/pile", "/anything-a-later-slice-adds"])(
    "covers %s",
    (pathname) => {
      expect(gateCovers(pathname)).toBe(true);
    }
  );

  // The four things that must stay outside it:
  //
  //   - `api/auth`, because a gated sign-in endpoint is a gate that can never be
  //     opened;
  //   - `signin`, the one screen a non-owner may see;
  //   - `/mcp`, which is the other door and is authenticated by a static bearer
  //     rather than by Google (ADR-0004) — a redirect to a Google consent screen is
  //     not an answer an assistant can read;
  //   - `/api/showcase`, the third door's first resource, authenticated by its own
  //     bearer (ADR-0025) and excluded **by name**: `/api` is not a prefix exclusion,
  //     because `api/auth` already lives under it and a prefix-wide hole is one every
  //     later route falls into without anybody deciding it should;
  //   - `/.well-known`, which RFC 8615 reserves for metadata a machine fetches before
  //     it has credentials. A discovery probe that gets `307 /signin` learns nothing;
  //     a `404` correctly says this server publishes none;
  //   - the build output and the favicon, which the browser fetches unprompted and
  //     without credentials;
  //   - the icons and the manifest, for that same reason and no new one. A manifest is
  //     fetched with credentials *omitted*, so gated it answers `307 /signin` and the phone
  //     silently never offers to install the app.
  it.each([
    "/api/auth/signin/google",
    "/api/auth/callback/google",
    "/signin",
    "/mcp",
    "/mcp/",
    "/api/showcase",
    "/.well-known",
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
    "/favicon.ico",
    "/icon.svg",
    // The favicon's raster twin, and it has to be out here for a reason the SVG's own
    // exclusion does not cover: Safari could not read an SVG favicon at all before 26.0, so
    // this is *the* icon that browser sees — and gated, the tab it draws is empty.
    "/icon1",
    "/apple-icon",
    "/manifest.webmanifest",
    "/_next/static/chunks/main.js",
    "/_next/image",
  ])("leaves %s outside the gate", (pathname) => {
    expect(gateCovers(pathname)).toBe(false);
  });

  // The exclusions are paths, not prefixes. Unanchored they would also excuse
  // anything merely starting with those letters, which is a wider hole than the
  // reservation: these paths were excluded, not these prefixes.
  it.each([
    "/signing-off",
    "/mcps",
    "/mcp-token",
    "/api/authors",
    "/api/showcases",
    "/api/showcase-token",
    "/.well-known-ish",
    "/.well-knownish/anything",
    "/icon.svg.map",
    "/icon10",
    "/apple-icons",
    "/manifest.webmanifest.bak",
  ])("covers %s, which only looks like an exclusion", (pathname) => {
    expect(gateCovers(pathname)).toBe(true);
  });
});
