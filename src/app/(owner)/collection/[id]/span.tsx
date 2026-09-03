"use client";

import { useEffect, useRef, useState } from "react";

import { type PartBounds, thePartUnder, theSpanAsked } from "./span-of-the-work";

// THE SPAN AS A CONTROL: sweep across the parts of the work to say which of them are inside
// this object, press one to say it holds only that.
//
// **The two boxes are the specification and this is a shorter way to the same write**
// (ADR-0010), which is the shape `paths/[id]/rail.tsx` already has on a route. This component
// adds no field, no id and no verb of its own: it reads which tick the pointer is over, fills
// in the two inputs the server already rendered and **submits a form that was on the page
// before any bundle arrived**. So a script that never parses costs the owner the gesture and
// nothing else — the range is still typed, and still posts.
//
// **Unlike the rail, it is offered to a thumb as well, and that is the point rather than an
// oversight.** The rail is spent at a desk only because its gesture is vertical inside a
// column that scrolls vertically, and a browser cannot reliably tell those two apart. This
// one is horizontal inside a page that scrolls vertically, so `touch-action: pan-y` separates
// them with no ambiguity at all — which is why it is Pointer Events rather than HTML5 drag.
// The object this exists for is the omnibus, and an omnibus is bought standing in a shop.
//
// **The ticks are the server's drawing and this component never re-renders one.** What a
// gesture in flight changes is a data attribute on ticks that are already there, exactly as a
// drop on the rail marks rows it did not draw — so there is no React tree of parts that could
// come to disagree with the one the page sent. What it does own is the readout underneath,
// which exists only while the pointer is down.
//
// What is left in here holds no derivation (`vitest.config.ts`): a rectangle, four listeners
// and a form. Which part the pointer is over is `./span-of-the-work.ts`, tested beside itself.

/** The two fields the gesture answers — the same two the owner types into. */
const FROM = "coversFrom";
const TO = "coversTo";

/** The ticks the page drew, measured where they are now. */
function partsOf(track: HTMLElement): PartBounds[] {
  return Array.from(track.querySelectorAll<HTMLElement>("[data-part]")).map((tick) => {
    const box = tick.getBoundingClientRect();
    return { part: Number(tick.dataset.part), left: box.left, right: box.right };
  });
}

/** The parts a gesture in flight is over, marked on the ticks themselves. */
function mark(track: HTMLElement, said: { from: number; to: number } | null): void {
  for (const tick of track.querySelectorAll<HTMLElement>("[data-part]")) {
    const part = Number(tick.dataset.part);
    if (said && part >= said.from && part <= said.to) tick.dataset.asked = "in";
    else delete tick.dataset.asked;
  }
}

/**
 * The work drawn as its own parts, with the gesture attached — a wrapper over ticks the
 * server rendered, the way the rail wraps stops it did not draw.
 *
 * `form` is the id of the plain form standing beside it, whose two fields and Server Function
 * are the whole of the write. That is the entire seam between them.
 */
export function Span({
  form,
  label,
  className,
  children,
}: {
  form: string;
  /** What the span says at rest, read back underneath while the pointer is not down. */
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  // What the gesture is saying right now, and nothing is written until the pointer comes up.
  // `null` at rest, which is every moment the owner is not sweeping.
  const [asked, setAsked] = useState<{ from: number; to: number } | null>(null);

  useEffect(() => {
    const strip = track.current;
    if (!strip) return;

    // The stylesheet reads this: the track takes a crosshair and the ticks grow to something
    // a finger can hit. Until it is set — no script, a bundle still parsing — the span is the
    // server's drawing and nothing about it suggests a gesture that is not there.
    strip.dataset.gesture = "on";

    /** The part the sweep started on. The other end is wherever the pointer is. */
    let anchor: number | null = null;

    const at = (x: number) => thePartUnder(partsOf(strip), x);

    const start = (event: PointerEvent) => {
      const part = at(event.clientX);
      if (part === null) return;
      anchor = part;
      // Captured, so a sweep that leaves the strip is still this strip's gesture and a
      // pointer let go outside it still lands rather than hanging.
      strip.setPointerCapture(event.pointerId);
      const said = theSpanAsked(part, part);
      setAsked(said);
      mark(strip, said);
    };

    const sweep = (event: PointerEvent) => {
      if (anchor === null) return;
      const part = at(event.clientX);
      if (part === null) return;
      const said = theSpanAsked(anchor, part);
      setAsked(said);
      mark(strip, said);
    };

    /** The gesture is over: the marks go, nothing is held. */
    const rest = () => {
      anchor = null;
      setAsked(null);
      mark(strip, null);
    };

    const land = (event: PointerEvent) => {
      const from = anchor;
      const part = at(event.clientX);
      rest();
      if (from === null || part === null) return;

      const said = theSpanAsked(from, part);
      const posting = document.getElementById(form);
      if (!(posting instanceof HTMLFormElement)) return;
      const first = posting.elements.namedItem(FROM);
      const last = posting.elements.namedItem(TO);
      if (!(first instanceof HTMLInputElement) || !(last instanceof HTMLInputElement)) return;

      first.value = String(said.from);
      last.value = String(said.to);
      posting.requestSubmit();
    };

    /** Let go somewhere the browser took over, or called off. The record is untouched. */
    const abandon = () => rest();

    strip.addEventListener("pointerdown", start);
    strip.addEventListener("pointermove", sweep);
    strip.addEventListener("pointerup", land);
    strip.addEventListener("pointercancel", abandon);

    return () => {
      strip.dataset.gesture = "off";
      strip.removeEventListener("pointerdown", start);
      strip.removeEventListener("pointermove", sweep);
      strip.removeEventListener("pointerup", land);
      strip.removeEventListener("pointercancel", abandon);
      mark(strip, null);
    };
  }, [form]);

  return (
    <div>
      <div
        ref={track}
        data-gesture="off"
        className={`touch-pan-y select-none data-[gesture=on]:cursor-crosshair ${className ?? ""}`}
      >
        {children}
      </div>
      {/* One line, one height, whether or not a gesture is in flight — a readout that appears
          would push the row it is in down under the owner's own finger. */}
      <p className="mt-1.5 h-4 text-xs text-muted-foreground">
        {asked === null
          ? label
          : asked.from === asked.to
            ? `Instalment ${asked.from}`
            : `Instalments ${asked.from}–${asked.to}`}
      </p>
    </div>
  );
}
