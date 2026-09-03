"use client";

// PROTOTYPE — throwaway. The span made into the control: drag across the Instalments of the
// work to say which of them are inside this object, tap one to say it holds only that.
//
// **The two boxes are the specification and this is a shorter way to the same write**
// (ADR-0010, and the shape `paths/[id]/rail.tsx` already uses). This component adds no field,
// no id and no verb: it reads which tick the pointer is over, fills the two inputs the server
// already rendered and submits that form. A bundle that never arrives costs the owner the
// gesture and nothing else — the boxes are still there, still typed, still posting.
//
// **Unlike the rail, it is offered to a thumb as well.** The rail's gesture is vertical inside
// a column that scrolls vertically, and a browser gets that wrong; this one is horizontal
// inside a page that scrolls vertically, so `touch-action: pan-y` separates the two with no
// ambiguity at all. That is why it is Pointer Events rather than HTML5 drag — and it is the
// half of the design worth arguing about, because it is the one that would work in a shop.
//
// It holds no derivation: a rectangle, a clamp, and four listeners.

import { useEffect, useRef, useState } from "react";

/** The fields the gesture answers — the same two the owner types into. */
const FROM = "coversFrom";
const TO = "coversTo";

/** A tick, by the Instalment it stands for. */
function instalmentUnder(track: HTMLElement, clientX: number): number | null {
  const ticks = Array.from(track.querySelectorAll<HTMLElement>("[data-instalment]"));
  if (ticks.length === 0) return null;

  // The nearest tick rather than the one strictly under the pointer, so a drag that runs off
  // either end lands on 1 or on the last part instead of stopping dead.
  let nearest: number | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const tick of ticks) {
    const box = tick.getBoundingClientRect();
    const away =
      clientX < box.left ? box.left - clientX : clientX > box.right ? clientX - box.right : 0;
    if (away < best) {
      best = away;
      nearest = Number(tick.dataset.instalment);
    }
  }
  return nearest;
}

export function SpanDrag({
  formId,
  className,
  children,
}: {
  formId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  // What the gesture is saying right now, drawn under the track and never written until the
  // pointer comes up. `null` at rest, which is every moment the owner is not dragging.
  const [pending, setPending] = useState<{ from: number; to: number } | null>(null);

  useEffect(() => {
    const strip = track.current;
    if (!strip) return;

    // The stylesheet reads this: until it is set the ticks are the server's drawing and
    // nothing about them suggests a gesture that is not there.
    strip.dataset.drag = "on";

    /** The tick the gesture started on. The other end is wherever the pointer is. */
    let anchor: number | null = null;

    const span = (at: number) =>
      anchor === null ? null : { from: Math.min(anchor, at), to: Math.max(anchor, at) };

    const start = (event: PointerEvent) => {
      const at = instalmentUnder(strip, event.clientX);
      if (at === null) return;
      anchor = at;
      strip.setPointerCapture(event.pointerId);
      setPending({ from: at, to: at });
      event.preventDefault();
    };

    const move = (event: PointerEvent) => {
      if (anchor === null) return;
      const at = instalmentUnder(strip, event.clientX);
      if (at !== null) setPending(span(at));
    };

    const land = (event: PointerEvent) => {
      if (anchor === null) return;
      const at = instalmentUnder(strip, event.clientX);
      const said = at === null ? null : span(at);
      anchor = null;
      setPending(null);
      if (!said) return;

      const form = document.getElementById(formId);
      if (!(form instanceof HTMLFormElement)) return;
      const from = form.elements.namedItem(FROM);
      const to = form.elements.namedItem(TO);
      if (!(from instanceof HTMLInputElement) || !(to instanceof HTMLInputElement)) return;

      from.value = String(said.from);
      to.value = String(said.to);
      form.requestSubmit();
    };

    /** Let go anywhere else, or called off. Nothing is written. */
    const abandon = () => {
      anchor = null;
      setPending(null);
    };

    strip.addEventListener("pointerdown", start);
    strip.addEventListener("pointermove", move);
    strip.addEventListener("pointerup", land);
    strip.addEventListener("pointercancel", abandon);

    return () => {
      strip.dataset.drag = "off";
      strip.removeEventListener("pointerdown", start);
      strip.removeEventListener("pointermove", move);
      strip.removeEventListener("pointerup", land);
      strip.removeEventListener("pointercancel", abandon);
    };
  }, [formId]);

  return (
    <div>
      <div
        ref={track}
        data-drag="off"
        data-pending={pending ? "on" : undefined}
        className={`touch-pan-y select-none data-[drag=on]:cursor-crosshair ${className ?? ""}`}
      >
        {/* The ticks the gesture is over, marked over whatever the server drew on them. */}
        {children}
        {pending ? <PendingMarks from={pending.from} to={pending.to} /> : null}
      </div>
      <p className="mt-1 h-4 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
        {pending
          ? pending.from === pending.to
            ? `Instalment ${pending.from}`
            : `Instalments ${pending.from}–${pending.to}`
          : ""}
      </p>
    </div>
  );
}

/**
 * The live answer, written onto the ticks themselves rather than re-rendered as a React tree
 * of them — the server's drawing stays the drawing, exactly as the rail's rows do.
 */
function PendingMarks({ from, to }: { from: number; to: number }) {
  const marks = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const strip = marks.current?.parentElement;
    if (!strip) return;
    for (const tick of strip.querySelectorAll<HTMLElement>("[data-instalment]")) {
      const at = Number(tick.dataset.instalment);
      if (at >= from && at <= to) tick.dataset.pending = "in";
      else delete tick.dataset.pending;
    }
    return () => {
      for (const tick of strip.querySelectorAll<HTMLElement>("[data-instalment]")) {
        delete tick.dataset.pending;
      }
    };
  }, [from, to]);

  return <span ref={marks} className="hidden" />;
}
