import { describe, expect, it } from "vitest";

import { apiCallerGate } from "./api";

// Seam 2's arithmetic for the third door, and the same shape `gate.test.ts` and
// `rate-limit.test.ts` are: environment in, verdict out, no HTTP, no request, no mock of the
// thing under test. It is a table of cases because the gate is a pure function, which is the
// whole reason the predicate lives apart from the route handler that spends it.
//
// **Both directions**, and the closed one matters more: a gate that lets the owner in is
// noticed in a second, and a gate that lets everybody in is noticed by nobody.

const TOKEN = "a-bearer-for-this-test-and-nowhere-else";

/** An environment with exactly what is named in it, and nothing this gate could fall back on. */
function env(values: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values } as NodeJS.ProcessEnv;
}

const CONFIGURED = env({ API_BEARER_TOKEN: TOKEN });

describe("the API bearer gate", () => {
  it("lets the configured token through", () => {
    expect(apiCallerGate(CONFIGURED, `Bearer ${TOKEN}`)).toEqual({ ok: true });
  });

  // RFC 7235 says the scheme is case-insensitive, so a client sending `bearer` is right and
  // being strict about it would be this application inventing a rule.
  it.each(["bearer", "BEARER", "BeArEr"])("accepts %s as the scheme", (scheme) => {
    expect(apiCallerGate(CONFIGURED, `${scheme} ${TOKEN}`)).toEqual({ ok: true });
  });

  it("forgives whitespace around the header and the token", () => {
    expect(apiCallerGate(CONFIGURED, `  Bearer   ${TOKEN}  `)).toEqual({ ok: true });
  });

  it("forgives whitespace around the configured value, which a cluster secret often carries", () => {
    expect(apiCallerGate(env({ API_BEARER_TOKEN: `\n${TOKEN}\n` }), `Bearer ${TOKEN}`)).toEqual({
      ok: true,
    });
  });

  it.each([
    ["no header at all", undefined],
    ["a null header", null],
    ["an empty header", ""],
    ["a blank header", "   "],
    ["the scheme and nothing after it", "Bearer"],
    ["the scheme and a blank token", "Bearer    "],
  ])("refuses %s", (_case, authorization) => {
    expect(apiCallerGate(CONFIGURED, authorization)).toEqual({ ok: false, refusal: "absent" });
  });

  // A different scheme carrying the same secret is not a bearer token. Forgiving it would be
  // this gate accepting a credential it never agreed to read.
  it.each([`Basic ${TOKEN}`, `Token ${TOKEN}`, TOKEN])("refuses %s", (authorization) => {
    expect(apiCallerGate(CONFIGURED, authorization)).toEqual({ ok: false, refusal: "absent" });
  });

  it.each([
    ["a token that is not the configured one", "something-else-entirely"],
    ["a prefix of the configured one", TOKEN.slice(0, -1)],
    ["the configured one with something after it", `${TOKEN}x`],
    ["the configured one in the wrong case", TOKEN.toUpperCase()],
  ])("refuses %s", (_case, presented) => {
    expect(apiCallerGate(CONFIGURED, `Bearer ${presented}`)).toEqual({
      ok: false,
      refusal: "wrong",
    });
  });

  // **Fails closed**, which is the case this file exists for. A deployment that forgot the
  // secret refuses everybody rather than publishing the library to whoever finds the URL, and
  // it says which of the two it was in its own log so a misconfiguration and a stranger at the
  // door do not look identical.
  it.each([
    ["unset", {}],
    ["empty", { API_BEARER_TOKEN: "" }],
    ["blank", { API_BEARER_TOKEN: "   " }],
  ])("refuses every caller when the variable is %s", (_case, values) => {
    expect(apiCallerGate(env(values), `Bearer ${TOKEN}`)).toEqual({
      ok: false,
      refusal: "not-configured",
    });

    // Including one presenting the empty string, which is what an unset variable on the
    // caller's side turns into by the time it reaches a header.
    expect(apiCallerGate(env(values), "Bearer ")).toEqual({
      ok: false,
      refusal: "not-configured",
    });
  });

  // The two doors carry two secrets on purpose (ADR-0025), so this gate must not be openable
  // with the other one. It is the property the duplication between this file and
  // `@/lib/mcp/bearer` is paying for, so it is asserted rather than assumed.
  it("is not opened by the MCP door's token", () => {
    const assistants = env({ MCP_BEARER_TOKEN: "the-assistants-token" });

    expect(apiCallerGate(assistants, "Bearer the-assistants-token")).toEqual({
      ok: false,
      refusal: "not-configured",
    });
  });
});
