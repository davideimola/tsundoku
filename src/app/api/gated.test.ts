import { describe, expect, it } from "vitest";

import { SRC, sourceFiles } from "@/test/source-files";

// The third door's wall, and it is a wall for the reason `src/app/gated.test.ts` is one: the
// failure it catches is silent. A route handler added under `/api` that forgets
// `requireApiCaller()` compiles, answers, and reads Postgres exactly as intended. It has
// simply published the library to whoever found the URL, and nothing else in the repository
// would notice.
//
// `/api` is **not** excluded from the owner gate as a prefix (`src/proxy.ts`), so a new route
// left out of that matcher answers `307 /signin` and is useless rather than open. This is the
// other half of that pair: a route that *is* named in the matcher, and therefore stands
// outside Google, has exactly one thing in front of it, and this is what fails when that one
// thing goes missing.

const API = `${SRC}app/api`;

// Auth.js's own endpoints, excluded **by name**.
//
// `/api/auth/[...nextauth]` is the sign-in flow itself: it is the route a visitor with no
// credentials has to be able to reach in order to get any, and it is Auth.js's handler rather
// than ours (`src/lib/auth/index.ts` exports it, this file re-exports it). Demanding a bearer
// token on it would be a gate that can never be opened. It is one path and not a prefix: a
// second route under `api/auth/` would be ours and would need the wall like every other.
const AUTH_JS = "auth/[...nextauth]/route.ts";

// The call, not merely the import: a file that imports the wall and forgets to spend the
// answer has the same hole as one that never heard of it.
const CALLS_THE_WALL = /requireApiCaller\s*\(/;

const routes = sourceFiles(API).filter((read) => /(?:^|\/)route\.tsx?$/.test(read.file));

describe("the wall in front of the API", () => {
  // Guards itself as well as the app: a filter that matched nothing would pass the
  // expectations below for the wrong reason.
  it("finds the routes it is about to check", () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it("knows which file it is excusing, so the exclusion cannot go stale", () => {
    expect(routes.map((read) => read.file)).toContain(AUTH_JS);
  });

  it("is called by every route handler under /api", () => {
    const unwalled = routes
      .filter((read) => read.file !== AUTH_JS)
      .filter((read) => !CALLS_THE_WALL.test(read.source))
      .map((read) => read.file);

    expect(unwalled).toEqual([]);
  });
});
