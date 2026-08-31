"use client";

import { Dialog } from "@base-ui/react/dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { suggest } from "./find/actions";
import { FoundRow, nothingIsCalled, ROW } from "./find/row";
import type { Suggestion, SuggestionGroup } from "./find/suggestion";

// THE FINDER, as a palette over the whole screen — one glyph beside the mark, and `⌘K`
// from anywhere (#25).
//
// **The unscripted twin is a link, and that is the whole design.** The glyph is an
// `<a href="/find">`: with nothing running in the browser it is a link to a screen carrying
// a plain `GET` form over the same query, and with a script it opens this instead. Nothing
// here is the only way to anything — which is what ADR-0010 asks of a scripted control, and
// it is why the trigger is a link rather than a button. A button would be a control that
// does nothing on a shop's signal.
//
// It costs one thing against the field that stood in the sidebar before it, and the trade is
// worth saying out loud: without a script the owner now takes one extra step — the link,
// then the field on `/find` — where the field in the chrome could be typed into where it
// stood. What is bought is a search that is one keystroke away from every screen, at the
// size of the answer rather than the size of a sidebar, and a chrome that spends 24 pixels
// on it instead of a row.
//
// **There is one of it**, rendered by the shell beside the map rather than inside either
// chrome, which is what makes the shortcut a single listener and the answer a single piece
// of state. The trigger is the thing that appears twice.
//
// So there is **no derivation in here.** What a suggestion is called, what qualifies it and
// where enter lands are decided on the server (`./find/kinds`) and arrive drawn
// (`./find/suggestion`, `./find/row`). What is left is a text field, a highlight and a
// keystroke — which is why this component has no test and everything it draws does
// (`vitest.config.ts`, `src/core/queries/finder.test.ts`, `./find/kinds.test.ts`).

/** How long the owner has to stop typing before the library is asked. */
const SETTLE = 140;

/**
 * The way in: a glyph beside the mark, and the key that opens it.
 *
 * A **link to `/find`** that opens the palette instead when a script is there to open it.
 * Only an unmodified click is taken — `⌘`-click and shift-click are how a browser opens a
 * link somewhere else, and swallowing them would take an affordance away from a control that
 * looks exactly like a link because it is one. A middle click needs no such care: it never
 * reaches `onClick` at all.
 *
 * The `⌘K` beside it is the hint, and it is the reason this is not an unlabelled glyph:
 * a magnifier says *there is a search*, and the key says *and this is how it is opened
 * without reaching for the mouse*. It is shown only where there is a keyboard to press it
 * on — the width at which the sidebar exists at all.
 */
export function FinderTrigger({ onOpen, className }: { onOpen: () => void; className?: string }) {
  return (
    <Link
      href="/find"
      aria-label="Find anything in the library"
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onOpen();
      }}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-muted-foreground transition-colors",
        "outline-none hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <Magnifier className="size-4" />
      <Kbd className="hidden lg:inline-flex">
        <Shortcut />
      </Kbd>
    </Link>
  );
}

/**
 * The palette: the field, the answer under it, and the keys that work it.
 *
 * `open` is the shell's, because the trigger that sets it is in the shell's chrome and this
 * is rendered beside it rather than inside it. The shortcut listens here, once, for the
 * reason there is one of these: two listeners over one window would each have to work out
 * whether they were the one on screen.
 */
export function FinderPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // `⌘K`, or `Ctrl+K` where there is no `⌘`. Both, always, rather than the one the platform
  // is guessed to be: the guess is only ever used to *print* the hint, and a shortcut that
  // refused the key the owner actually pressed would be a worse bug than a wrong label.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      onOpenChange(true);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Dialog.Portal>
        {/* The library, still there and out of focus behind it. A palette that blacked the
            screen out would be a page rather than a way through one.
            
            The fade is polish and also a mechanism: base-ui keeps a popup mounted while it
            is `data-closed` and removes it when the exit animation ends, so this is both how
            the palette leaves and how it is told to. A hundred milliseconds, because a thing
            that opens on a keystroke should not be waited for. */}
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-background/70 duration-100 supports-backdrop-filter:backdrop-blur-sm data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />

        {/* Centred by translation rather than by `mx-auto` with a width, which is the pair
            `./shell.test.ts` forbids — and rightly: that pair is a *screen* running down the
            middle of a wide monitor. This is a dialog, and the top tenth is where a hand
            reaching for a keyboard expects one. */}
        {/* **The focus is the field's, and this says so twice on purpose.** `initialFocus`
            is turned off rather than pointed at the input: base-ui moves focus by reasoning
            about the interaction that opened a popup, and this one is opened by a keystroke
            and by a link rather than by a trigger it owns — so it has no interaction to
            reason from and leaves the focus on the body, which is a palette that cannot be
            typed into. `Search` takes it on mount instead, which is the same moment and one
            mechanism rather than two racing. */}
        <Dialog.Popup
          initialFocus={false}
          className="fixed left-1/2 top-[8vh] z-50 w-[min(38rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl duration-100 outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 sm:top-[12vh]"
        >
          <Dialog.Title className="sr-only">Find anything in the library</Dialog.Title>
          {/* Mounted with the palette and unmounted with it, which is what clears the last
              search: the field, the answer and the highlight all live in here, so closing is
              the whole of forgetting. */}
          <Search onDone={() => onOpenChange(false)} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The working half: what has been typed, what the library answered, and where enter goes. */
function Search({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const listId = useId();
  const field = useRef<HTMLInputElement>(null);

  const [term, setTerm] = useState("");
  const [groups, setGroups] = useState<SuggestionGroup[]>([]);
  const [active, setActive] = useState(0);
  const [asking, setAsking] = useState(false);

  // The palette exists to be typed into, and it is mounted only while it is open, so this
  // runs exactly when it opens and never otherwise.
  useEffect(() => {
    field.current?.focus();
  }, []);

  // The answer, flat, in the order it is drawn: what the arrow keys walk and what enter
  // lands on. Derived rather than held, so it cannot disagree with what is on screen.
  const rows = groups.flatMap((group) => group.suggestions);
  const typed = term.trim();

  // Ask the library, once the owner has stopped typing. A later keystroke drops the answer
  // it was waiting for: two requests in flight come back in whatever order the network gives
  // them, and a stale one landing last is a list that disagrees with the field above it.
  useEffect(() => {
    if (typed === "") {
      setGroups([]);
      setAsking(false);
      return;
    }

    let current = true;
    setAsking(true);
    const timer = setTimeout(async () => {
      try {
        const found = await suggest(typed);
        if (!current) return;
        setGroups(found);
        // **The first row is highlighted as soon as there is one**, because *enter lands on
        // the record* is the gesture this whole thing is for (#25). A palette whose default
        // enter went to a page of results would be a destination, which is the one thing the
        // finder is not — and the way to that page is a link of its own, below.
        setActive(0);
      } catch {
        // A suggestion that did not arrive is an empty palette. The way through is the form
        // this still is, and it has not moved.
        if (current) setGroups([]);
      } finally {
        if (current) setAsking(false);
      }
    }, SETTLE);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [typed]);

  /** Close first, then go: the palette must not be standing over the record it opened. */
  function go(href: string) {
    onDone();
    router.push(href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // **No escape branch here, and that is a finding rather than an omission.** Base-ui
    // dismisses a modal on escape itself, and it does so by stopping the event at the popup
    // — verified: an escape dispatched at the field reaches `document` in the capture phase
    // and the popup in the bubble phase, and never arrives at React's own listener. A second
    // handler for that key would be unreachable code with a comment claiming it worked.
    if (rows.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((at) => (at + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((at) => (at <= 0 ? rows.length - 1 : at - 1));
    }
  }

  // Enter: the highlighted record, and with nothing highlighted the screen the form was
  // pointed at anyway — including from a blank field, which is where the plain form would
  // have gone too. `preventDefault` has already stopped the browser, so anything not done
  // here is a gesture the scripted half swallows and the unscripted one honours, and where
  // the two diverge the unscripted one is right (ADR-0010).
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const landing = rows[active];
    if (landing) return go(landing.href);

    go(typed === "" ? "/find" : `/find?q=${encodeURIComponent(typed)}`);
  }

  return (
    <search>
      <form method="get" action="/find" onSubmit={onSubmit}>
        <div className="flex items-center gap-2.5 border-b border-border px-3.5">
          <Magnifier className="size-4 shrink-0 text-muted-foreground" />
          <label htmlFor={`${listId}-field`} className="sr-only">
            Find anything in the library
          </label>
          <Input
            id={`${listId}-field`}
            ref={field}
            name="q"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="A title, a name, a publisher’s line…"
            autoComplete="off"
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={rows.length > 0 ? `${listId}-${active}` : undefined}
            // **The one field in the application with no box of its own**: the palette *is*
            // the box, and a second border and ground inside it would be a field inside a
            // field. `dark:bg-transparent` is not redundant beside `bg-transparent` — the
            // shared component carries a `dark:bg-input/30`, and a variant is not overridden
            // by the bare class that merges with it, so in a dark room the box came back.
            className="h-12 rounded-none border-0 bg-transparent px-0 text-base focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
          />
        </div>

        {rows.length > 0 ? (
          <div
            id={listId}
            role="listbox"
            aria-label="Found in the library"
            className="max-h-[min(24rem,50vh)] overflow-y-auto p-1.5"
          >
            {groups.map((group) => (
              // biome-ignore lint/a11y/useSemanticElements: a `fieldset` inside a `listbox` is not a group of options, and this is.
              <div key={group.heading} role="group" aria-label={group.heading}>
                <p className="px-2 py-1 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
                  {group.heading}
                </p>
                {group.suggestions.map((suggestion) => {
                  const at = rows.indexOf(suggestion);
                  return (
                    <Row
                      key={suggestion.href}
                      id={`${listId}-${at}`}
                      suggestion={suggestion}
                      highlighted={at === active}
                      onHover={() => setActive(at)}
                      onChoose={() => onDone()}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}

        {/* Three states and not two, because *nothing yet* and *nothing at all* are
            different things to be told. A palette that answered "nothing found" to a field
            still being typed into would be arguing with the owner mid-word. */}
        {typed !== "" && rows.length === 0 && !asking ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{nothingIsCalled(typed)}</p>
        ) : null}

        <Footing term={typed} />
      </form>
    </search>
  );
}

/**
 * The foot of the palette: what the keys do, and the way to the whole answer.
 *
 * **The link is the finder's own escape hatch**, and it is the reason enter can be spent on
 * the record. The palette shows the first few of each kind; `/find` shows four times as
 * many, and without it *see the rest* would be a gesture the owner had to already know.
 */
function Footing({ term }: { term: string }) {
  const quiet =
    "rounded-md px-1.5 py-0.5 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
      {/* The keys, where there is a keyboard to press them on. */}
      <p className="hidden items-center gap-3 text-eyebrow text-muted-foreground lg:flex">
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd> open
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>esc</Kbd> close
        </span>
      </p>

      <div className="ml-auto flex items-center gap-3">
        {term === "" ? null : (
          <Link
            href={`/find?q=${encodeURIComponent(term)}`}
            className={cn(quiet, "underline underline-offset-4")}
          >
            All results
          </Link>
        )}

        {/* **A control and not only a key**, which is what `modal` asks of anything using
            it: focus is trapped in here, and on a touch screen there is no escape key to
            press and no backdrop a screen reader will hand you. Always rendered rather than
            hidden above `lg` — a way out of a trap is not chrome to save space on. */}
        <Dialog.Close className={quiet}>Close</Dialog.Close>
      </div>
    </div>
  );
}

/**
 * One suggestion, as a row.
 *
 * A real `Link`, so it is a thing that can be clicked, middle-clicked and opened in a tab
 * like every other way into a record. `onMouseDown` is stopped because the mouse would
 * otherwise take the focus out of the field first, and the field is what the arrow keys and
 * enter belong to.
 */
function Row({
  id,
  suggestion,
  highlighted,
  onHover,
  onChoose,
}: {
  id: string;
  suggestion: Suggestion;
  highlighted: boolean;
  onHover: () => void;
  onChoose: () => void;
}) {
  return (
    <Link
      id={id}
      href={suggestion.href}
      role="option"
      aria-selected={highlighted}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={onHover}
      onClick={onChoose}
      className={cn(
        ROW,
        "transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        highlighted ? "bg-accent text-accent-foreground" : "text-muted-foreground"
      )}
    >
      <FoundRow name={suggestion.name} qualifier={suggestion.qualifier} />
    </Link>
  );
}

/**
 * The key the hint prints, which is the one place the platform is guessed at.
 *
 * `⌘K` on the first render and on the server, then corrected once the browser can be asked:
 * the two have to agree at hydration, and a `⌘` on a machine that has none is a wrong label
 * for a moment rather than a mismatch. The handler above takes both keys either way, so the
 * guess costs nothing when it is wrong — and the owner of a fork on Linux is a documented
 * reader of this application (`README.md`), not a hypothetical one.
 */
function Shortcut() {
  const [apple, setApple] = useState(true);

  useEffect(() => {
    setApple(/mac|iphone|ipad/i.test(navigator.userAgent));
  }, []);

  return <>{apple ? "⌘K" : "Ctrl K"}</>;
}

/**
 * A magnifier, drawn here.
 *
 * No icon library, for the reason `src/components/mark.tsx` gives and #19 decided: one
 * glyph does not earn a dependency, a build step and a tree-shaking argument. It is a
 * stroked circle and a handle in the same 24-unit square the mark is drawn in, so the two
 * shapes beside each other in the chrome are the same weight of drawing.
 */
function Magnifier({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <circle cx="10.5" cy="10.5" r="6.75" />
      <path d="M15.6 15.6 21 21" />
    </svg>
  );
}
