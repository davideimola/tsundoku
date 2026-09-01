"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// THE SCANNER: the camera as a second way of filling in one field, and **nothing else**.
//
// **Read this before anything else in here: it is an enhancement over a field that already
// works.** The ISBN panel is a plain form with a text field in it. Typed, pasted, or filled in
// by the phone's own *Scan Text* out of the keyboard, that form posts and looks the book up
// with no JavaScript running at all — which is this application's standing rule (ADR-0010) and
// is not weakened by anything below. What this adds is the fastest of the several ways to get
// thirteen digits into that field, on the one device where the digits are printed on an object
// the owner is holding.
//
// So the button **is not rendered until a script is running**, and that is deliberate rather
// than incidental: the finder's argument applies unchanged — *a button that did nothing on a
// shop's signal was never an option* — and a scanner is the one control here that cannot have
// an unscripted twin, because a camera is a script. What it can have, and has, is a twin
// *field*: the thing it fills in is there either way.
//
// **There is no derivation in here**, which is the rule `vitest.config.ts` states and the
// reason this file has no test. Nothing in this component decides anything about an ISBN: the
// digits go into the field and the form is submitted, and whether they are an ISBN at all —
// whether they are the price add-on beside the barcode, or the ISSN-derived EAN on a Bonelli
// monthly — is read on the server by `@/core/isbn` and comes back as prose beside the field.
// A scanner that had refused a barcode itself would be a rule living in a browser.
//
// **Two decoders, one API, and the wasm one is fetched only where it is needed.**
// `BarcodeDetector` is native in Chrome and on Android. It is *not* in Safari, on the desk or
// on the phone — the implementation is there and disabled by default, checked on caniuse for
// 17.0 through 26.6 — and Safari on a phone is precisely the browser this feature is for. So
// where the platform has it, it is used and nothing is downloaded; where it does not, the same
// interface arrives from `barcode-detector`, which is ZXing compiled to WebAssembly, behind a
// dynamic `import()` on the first press. A megabyte on a shop's signal is a real cost and it
// is paid **once, on a deliberate press, by the browsers that cannot do it otherwise** — never
// on a render, and never by a phone that already can.
//
// The wasm is served from our own origin (`/decoder/zxing_reader.wasm`) rather than from the
// CDN the library defaults to. Two reasons, and the second is the one that matters in a shop:
// a third party is one more name to resolve, one more handshake and one more thing to be
// blocked, and this application's whole position on other people's servers is that they are
// asked deliberately and never on the way to something else. `src/app/vendored.test.ts` is
// what keeps the file we serve and the library we depend on the same decoder.

/**
 * Only EAN-13, which is what a book's barcode is.
 *
 * Narrow on purpose. A detector asked for everything reads the shop's QR code, the loyalty
 * card and the price add-on beside the ISBN — and the price add-on is the one that would be
 * *plausible*: five digits, printed a centimetre away, and the first thing in frame if the
 * phone is held slightly to the right.
 */
const A_BOOKS_BARCODE = ["ean_13"] as const;

/** Where the vendored decoder is served from. `src/app/vendored.test.ts` pins the bytes. */
const THE_DECODER = "/decoder/zxing_reader.wasm";

/** How often the frame in front of the camera is looked at. */
const EVERY = 240;

/** The half of `BarcodeDetector` this component uses, which is one method. */
type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

type Native = {
  new (options: { formats: readonly string[] }): Detector;
  getSupportedFormats: () => Promise<string[]>;
};

/**
 * A detector, from the platform where it has one and from WebAssembly where it does not.
 *
 * The native check asks for the *format* rather than for the constructor: Safari ships the
 * class disabled and a flag-enabled build need not support every format, so the question worth
 * asking is "can this browser read a book's barcode", and the wasm answers it where the
 * platform will not.
 */
async function aDetector(): Promise<Detector> {
  const native = (window as unknown as { BarcodeDetector?: Native }).BarcodeDetector;

  if (native) {
    try {
      const supported = await native.getSupportedFormats();
      if (A_BOOKS_BARCODE.every((format) => supported.includes(format))) {
        return new native({ formats: A_BOOKS_BARCODE });
      }
    } catch {
      // A platform that has the class and cannot be asked what it reads is a platform we
      // treat as not having it. The wasm below reads the same barcode either way.
    }
  }

  const { BarcodeDetector, setZXingModuleOverrides } = await import("barcode-detector/ponyfill");

  setZXingModuleOverrides({
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? THE_DECODER : `${prefix}${path}`,
  });

  return new BarcodeDetector({ formats: [...A_BOOKS_BARCODE] });
}

/**
 * A press that opens the camera, reads a book's barcode, and submits the form the field is in.
 *
 * `into` is the id of that field. The component writes the digits into it and calls
 * `requestSubmit()`, so the owner's whole gesture is *press, aim* — the lookup that follows is
 * the same one the typed field posts, and the answer arrives as a normal server render.
 */
export function ScanAnIsbn({ into }: { into: string }) {
  const [scripted, setScripted] = useState(false);
  const [looking, setLooking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const camera = useRef<MediaStream | null>(null);
  const screen = useRef<HTMLVideoElement | null>(null);

  // The button exists only where there is something to run it. Client components are rendered
  // on the server too, so without this the markup would carry a control that a phone with no
  // script — or a bundle still parsing on a shop's signal — draws and cannot honour.
  useEffect(() => setScripted(true), []);

  const stop = useCallback(() => {
    for (const track of camera.current?.getTracks() ?? []) track.stop();
    camera.current = null;
    setLooking(false);
  }, []);

  // A camera left running is a camera running while the owner is in a shop with the phone back
  // in their pocket, so it is stopped on the way out of this component as well as on the way
  // out of the panel.
  useEffect(() => stop, [stop]);

  const open = async () => {
    setFailed(null);

    // `getUserMedia` is called in the press itself rather than from an effect after it: on iOS
    // the permission prompt belongs to a gesture, and an effect is no longer inside one.
    try {
      camera.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
    } catch {
      setFailed(
        "The camera could not be opened. Type the ISBN, or scan the printed digits with the keyboard's own text scanner."
      );
      return;
    }

    setLooking(true);
  };

  // Everything the camera does happens while it is open, which is what this effect is: the
  // stream onto the video element, a detector, and a look at the frame four times a second.
  useEffect(() => {
    if (!looking) return;

    const video = screen.current;
    const stream = camera.current;
    if (!video || !stream) return;

    let watching = true;
    let waiting: ReturnType<typeof setTimeout> | undefined;

    const found = (code: string) => {
      watching = false;
      const field = document.getElementById(into);
      if (!(field instanceof HTMLInputElement)) return;

      field.value = code;
      stop();
      // The same submit the *Look it up* button performs. What a barcode buys is the typing,
      // never a different act.
      field.form?.requestSubmit();
    };

    (async () => {
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay refused with a live stream attached is unusual; the frames below simply
        // stay black and the owner presses away.
      }

      let detector: Detector;
      try {
        detector = await aDetector();
      } catch {
        if (watching) {
          setFailed(
            "The barcode reader could not be loaded. Type the ISBN, or try again on a better signal."
          );
          stop();
        }
        return;
      }

      const look = async () => {
        if (!watching) return;
        try {
          const codes = await detector.detect(video);
          const code = codes.find((one) => one.rawValue.trim() !== "");
          if (code) return found(code.rawValue.trim());
        } catch {
          // One unreadable frame is the normal case, not an error: the owner is moving a
          // phone over a book. The next frame is the answer.
        }
        waiting = setTimeout(look, EVERY);
      };

      await look();
    })();

    return () => {
      watching = false;
      if (waiting) clearTimeout(waiting);
    };
  }, [looking, into, stop]);

  if (!scripted) return null;

  return (
    <div className="grid gap-2">
      <Button type="button" variant="outline" onClick={open} className="h-11 w-full sm:h-10">
        Scan the barcode
      </Button>

      {failed ? <p className="text-pretty text-xs text-refusal">{failed}</p> : null}

      {looking ? (
        // Over the drawer, which is at `z-50`. A panel in the palette's own paper rather than
        // a dark scrim: the viewfinder is the content of this screen while it is open, and a
        // screen that named a colour to dim the one behind it would be a screen naming a
        // colour (`src/app/palette.test.ts`).
        <div className="fixed inset-0 z-[60] flex flex-col gap-4 bg-background p-5">
          <p className="text-pretty text-sm text-muted-foreground">
            Point it at the barcode on the back. The ISBN goes into the field and is looked up on
            its own.
          </p>

          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl ring-1 ring-foreground/10">
            {/* `playsInline` or iOS takes the video full-screen and out of this panel. Muted
                because a camera stream with sound is a stream Safari will not autoplay. */}
            <video ref={screen} muted playsInline className="h-full w-full object-cover" />
            {/* A line to aim along, which is the whole of the guidance a viewfinder needs. */}
            <div className="pointer-events-none absolute inset-x-6 top-1/2 h-px bg-foreground/40" />
          </div>

          <Button type="button" variant="outline" onClick={stop} className="h-11 w-full sm:h-10">
            Stop
          </Button>
        </div>
      ) : null}
    </div>
  );
}
