"use client";

import { useEffect, useRef } from "react";
import { whereItLands } from "./landing";

// THE RAIL, AND THE ONE SCRIPT ON THIS SCREEN: at a desk, with a mouse, a stop can be
// dragged to where it belongs.
//
// **The arrows are the specification and this is a shorter way to the same write**
// (ADR-0010). Every row still carries *first*, ↑, ↓ and ×, each a submit button in a plain
// form; this component adds no field, no id and no verb of its own. It sets `draggable` on a
// grip the stylesheet keeps hidden until it does, reads which gap the pointer let go in, and
// **submits a form the server already rendered** — the same `POST` to the same Server
// Function that *first* has posted to since the screen existed. So a bundle that never
// arrives costs the owner nothing but the gesture: the route re-orders one arrow at a time,
// which is how it has always re-ordered.
//
// **It is on at a desk only, and that is a decision rather than a limitation.** This
// application is used one-handed in a fumetteria, and there a drag is worse than a tap: a
// thumb on a list that scrolls inside a column has to hold still long enough for the browser
// to tell a drag from a scroll, and the browser gets it wrong. The gesture is worth having
// exactly where a mouse can start it precisely — and where the route is a long enough column
// that *first* plus twenty ↑ is the alternative. `(pointer: fine)` is the honest half of that
// query; the width is the second, because the route shares the screen with what has been said
// about it only from `lg` up.
//
// **The children are server-rendered rows and this component never reads one.** It is a
// wrapper over the `<ol>`: the stops arrive already drawn, each carrying its Story's id as a
// data attribute, and the listeners are delegated to the list. Nothing here is a React tree
// of stops that could disagree with the one the server sent, and nothing re-renders on a
// drag — the answer to a drop is the page the write comes back with, which is the same answer
// an arrow gets.
//
// What is left in here holds no derivation (`vitest.config.ts`): a media query, a rectangle,
// and four listeners. Which gap the pointer is in is `./landing.ts`, tested beside itself.

/**
 * The pointer this gesture is for: a mouse at a desk, and never a thumb in a shop.
 *
 * `64rem` is Tailwind's `lg`, which is where this screen becomes two columns.
 */
const AT_A_DESK = "(min-width: 64rem) and (pointer: fine)";

/**
 * The id of the plain form a drop submits, rendered by `./page.tsx` beside the rail.
 *
 * The form, its `action` and its hidden `pathId` are the server's; this component fills in
 * the two fields the gesture answers and presses it. That is the whole seam between them,
 * which is why it is one exported string.
 */
export const REORDERING = "reordering";

/** The field a drop writes: the Story carried, and the Story it comes to follow. */
const CARRIED = "storyId";
const ANCHOR = "afterStoryId";

/** Every stop in the rail, in the order the server rendered them. */
function stops(rail: HTMLElement): HTMLLIElement[] {
  return Array.from(rail.querySelectorAll<HTMLLIElement>("li[data-story-id]"));
}

/** The stop an event happened inside, or nothing where it happened between them. */
function stopUnder(event: DragEvent): HTMLLIElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLLIElement>("li[data-story-id]");
}

/**
 * The route, as an ordered list a stop can be dragged in at a desk.
 *
 * It takes the rows already drawn and the class the page would have put on the `<ol>`: the
 * order, the numbers, the marker on what comes next and the four forms on every row are all
 * the server's, and this wrapper is only where the gesture is attached.
 */
export function Rail({ className, children }: { className?: string; children: React.ReactNode }) {
  const rail = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = rail.current;
    if (!list) return;
    if (!window.matchMedia(AT_A_DESK).matches) return;

    // The stylesheet reads this: the grips appear and the rows take a grab cursor. Until it
    // is set — no script, a phone, a trackpad-less tablet — the rail is the server's plain
    // list and nothing on it suggests a gesture it does not have.
    list.dataset.drag = "on";

    /** The Story being carried, or nothing when the rail is at rest. */
    let carried: string | null = null;

    /**
     * Take the line off, and nothing else.
     *
     * **Two marks with two lifetimes**, which is worth saying because one function clearing
     * both is exactly the bug this shape fixes: the line moves with the pointer and is redrawn
     * on every `dragover`, while the row being carried stays dimmed for the whole gesture.
     */
    const unmark = () => {
      for (const stop of stops(list)) delete stop.dataset.drop;
    };

    /** The gesture is over: the line goes, the carried row comes back, nothing is held. */
    const release = () => {
      unmark();
      for (const stop of stops(list)) delete stop.dataset.carried;
      carried = null;
    };

    /** Where the pointer is asking for it, read against the route as it now stands. */
    const asked = (event: DragEvent) => {
      if (carried === null) return null;
      const rows = stops(list);
      const under = stopUnder(event);
      if (!under) return null;

      const box = under.getBoundingClientRect();
      return whereItLands(
        rows.map((stop) => stop.dataset.storyId ?? ""),
        carried,
        rows.indexOf(under),
        event.clientY < box.top + box.height / 2
      );
    };

    /** The line where it would land: under a stop, or over the first one for the front. */
    const draw = (after: string | null) => {
      unmark();
      const rows = stops(list);
      if (after === null) {
        const first = rows[0];
        if (first) first.dataset.drop = "before";
        return;
      }
      const anchor = rows.find((stop) => stop.dataset.storyId === after);
      if (anchor) anchor.dataset.drop = "after";
    };

    const lift = (event: DragEvent) => {
      const target = event.target;
      // A drag that did not start on a grip is the browser's own — a title being dragged as
      // a link, a selection — and this rail is not part of it.
      if (!(target instanceof Element) || !target.closest("[data-grip]")) return;

      const stop = stopUnder(event);
      const story = stop?.dataset.storyId;
      if (!stop || !story) return;

      carried = story;
      stop.dataset.carried = "true";
      // The row rather than the grip, so what follows the pointer is the stop being moved.
      event.dataTransfer?.setDragImage(stop, 24, stop.clientHeight / 2);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", story);
      }
    };

    const carry = (event: DragEvent) => {
      if (carried === null) return;
      const landing = asked(event);
      // Answering the browser's question — *may it be dropped here?* — for the whole rail,
      // including the gaps a drop would change nothing in: a row that refuses the drop
      // shows a no-entry cursor, which reads as a bug rather than as *it is already there*.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      if (landing) draw(landing.after);
      else unmark();
    };

    const land = (event: DragEvent) => {
      const moved = carried;
      const landing = asked(event);
      event.preventDefault();
      release();
      if (!landing || moved === null) return;

      const form = document.getElementById(REORDERING);
      if (!(form instanceof HTMLFormElement)) return;
      const story = form.elements.namedItem(CARRIED);
      const anchor = form.elements.namedItem(ANCHOR);
      if (!(story instanceof HTMLInputElement) || !(anchor instanceof HTMLInputElement)) return;

      story.value = moved;
      anchor.value = landing.after ?? "";
      form.requestSubmit();
    };

    /**
     * The pointer has left the rail altogether, so there is no gap to draw a line in.
     *
     * **Only when it has actually left**: moving from one row to the next fires a `dragleave`
     * on the row behind, and taking the line off for that one would be a line that blinks all
     * the way down a route.
     */
    const leave = (event: DragEvent) => {
      const to = event.relatedTarget;
      if (to instanceof Node && list.contains(to)) return;
      unmark();
    };

    /** A gesture let go anywhere else, or called off with escape. The route is untouched. */
    const abandon = () => release();

    list.addEventListener("dragstart", lift);
    list.addEventListener("dragenter", carry);
    list.addEventListener("dragover", carry);
    list.addEventListener("drop", land);
    list.addEventListener("dragend", abandon);
    list.addEventListener("dragleave", leave);

    return () => {
      list.dataset.drag = "off";
      list.removeEventListener("dragstart", lift);
      list.removeEventListener("dragenter", carry);
      list.removeEventListener("dragover", carry);
      list.removeEventListener("drop", land);
      list.removeEventListener("dragend", abandon);
      list.removeEventListener("dragleave", leave);
    };
  }, []);

  return (
    <ol ref={rail} data-drag="off" className={className}>
      {children}
    </ol>
  );
}
