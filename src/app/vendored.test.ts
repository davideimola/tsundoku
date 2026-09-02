import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ZXING_WASM_SHA256, ZXING_WASM_VERSION } from "barcode-detector/ponyfill";
import { describe, expect, it } from "vitest";

// The fourth wall in this app, beside `./gated.test.ts`, `./palette.test.ts` and
// `./hotlinked.test.ts`, and a wall for the same reason all three are: **the failure it
// catches is silent.**
//
// One file in this repository is a **binary we did not write**: the barcode decoder the ISBN
// scanner falls back to in Safari, which has no `BarcodeDetector` of its own. It is committed
// under `public/` rather than fetched from a CDN at runtime, because a shop's signal is the one
// this app is designed for and a third party on the critical path of a press is exactly what
// ADR-0013's rule about renders is protecting.
//
// The cost of holding a copy is that a copy can **drift from the library that loads it**.
// `barcode-detector` is pinned exactly in `package.json` — no caret, deliberately, because a
// dependency whose binary we carry by hand is one whose version should move only when somebody
// means it — and the wasm is not pinned at all, because a committed file has no version. Bump
// the dependency and the ponyfill will ask for the ABI of the build it ships with, be handed
// the one we vendored, and fail — in Safari only, on a press, in a shop, with no error anywhere
// a test would look. So:
//
//   **the bytes we serve are the bytes the library we depend on expects, and this is the
//   arithmetic that says so.**
//
// `ZXING_WASM_SHA256` is exported by the package for exactly this purpose and is the digest of
// its own `reader` build. Re-vendoring, when this fails, is one command:
//
//   cp "$(node -e 'process.stdout.write(require.resolve("zxing-wasm/reader").replace(/dist.*/, "dist/reader/zxing_reader.wasm"))')" \
//      public/decoder/zxing_reader.wasm
//
// Text and bytes in, a verdict out: no DOM, no renderer, no database, and the same licence the
// other three walls take.

/** Where the scanner asks for it — `src/components/scan.tsx`'s `THE_DECODER`. */
const SERVED_AT = "/decoder/zxing_reader.wasm";

const VENDORED = fileURLToPath(new URL(`../../public${SERVED_AT}`, import.meta.url));

describe("the decoder we serve is the decoder we depend on", () => {
  it("is there at the address the scanner asks for", () => {
    // A 404 for this file is a scanner that works in Chrome and is silently broken in Safari.
    expect(() => readFileSync(VENDORED)).not.toThrow();
  });

  it("is the byte-exact build the pinned library expects", () => {
    const digest = createHash("sha256").update(readFileSync(VENDORED)).digest("hex");

    expect(digest).toBe(ZXING_WASM_SHA256);
  });

  it("reports which version that is, so a failure above says what to re-vendor", () => {
    // Not an assertion about the number — a pin here would be a second thing to bump — but
    // the version is printed in the failure message of the test above by being read here.
    expect(ZXING_WASM_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
