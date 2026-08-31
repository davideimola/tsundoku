"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { suggest } from "./find/actions";
import { FoundRow, ROW } from "./find/row";
import type { Suggestion, SuggestionGroup } from "./find/suggestion";

// THE FIELD, on every screen — the finder's scripted half (#25).
//
// **The unscripted twin is the form this is** (ADR-0010): a `GET` to `/find` with one field
// called `q`, over the same query, grouped the same way. Everything below — the list that
// fills as the owner types, the arrow keys, the shortcut — is a shorter way to a place they
// can already get to. If none of it loads, the owner types and presses enter and lands on
// `/find`; where the two ever diverge, that screen is the specification and this is wrong.
//
// The one way they *do* differ is the size of the answer, and it is one-directional by
// design: the list is the **first few** of each kind, the screen is four times as many. So
// everything the list can reach the screen reaches, and never the other way round — a
// suggestion list long enough to cover the screen it hangs over would be a worse way to the
// same link.
//
// So there is **no derivation in here.** What a suggestion is called, what qualifies it and
// where enter lands are decided on the server (`./find/kinds`) and arrive drawn
// (`./find/suggestion`). What is left is a text field, a list and a highlight — which is why
// this component has no test and everything it draws does
// (`vitest.config.ts`, `src/core/queries/finder.test.ts`, `./find/kinds.test.ts`).
//
// **Two of it are rendered**, one in the sidebar and one in the phone's chrome, because the
// two are laid out differently and the shell renders no third shape. That is what the
// visibility check in the shortcut is for, below.

/** How long the owner has to stop typing before the library is asked. */
const SETTLE = 140;

export function Finder() {
  const router = useRouter();
  const listId = useId();

  const [term, setTerm] = useState("");
  const [groups, setGroups] = useState<SuggestionGroup[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const field = useRef<HTMLInputElement>(null);

  // The list, flat, in the order it is drawn: what the arrow keys walk and what enter
  // lands on. Derived rather than held, so it cannot disagree with what is on screen.
  const rows = groups.flatMap((group) => group.suggestions);

  // **The shortcut.** `/` is the one every reader knows and `⌘K`/`Ctrl+K` is the one every
  // application has; both are here because both are muscle memory and neither costs
  // anything. `/` is ignored while the owner is typing into something — otherwise it would
  // be impossible to type into a field at all.
  //
  // Two of this component exist and only one is on screen at a width, so each asks whether
  // it is the visible one before taking the key. `offsetParent` is the DOM's own answer to
  // that and needs no media query to be kept in step with the shell's.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const shortcut = event.key === "k" && (event.metaKey || event.ctrlKey);
      const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !typing(event.target);
      if (!shortcut && !slash) return;

      const input = field.current;
      if (!input || input.offsetParent === null) return;

      event.preventDefault();
      input.focus();
      input.select();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Ask the library, once the owner has stopped typing. The answer is dropped if a later
  // keystroke has already asked: two requests in flight come back in whatever order the
  // network gives them, and a stale one landing last is a list that disagrees with the
  // field it is under.
  useEffect(() => {
    const asked = term.trim();
    if (asked === "") {
      setGroups([]);
      return;
    }

    let current = true;
    const timer = setTimeout(async () => {
      try {
        const found = await suggest(asked);
        if (current) {
          setGroups(found);
          // **The first row is highlighted as soon as there is one**, because *enter lands
          // on the record* is the gesture this whole thing is for (#25): a finder whose
          // default enter went to a page of results would be a destination, which is the
          // one thing it is not. Escape is how the owner asks for the page instead, and it
          // is the only way to want it — they are looking at the answer already.
          setActive(0);
        }
      } catch {
        // A suggestion that did not arrive is a dropdown that stays shut. The way through
        // is the form, and it has not moved.
        if (current) setGroups([]);
      }
    }, SETTLE);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [term]);

  const showing = open && rows.length > 0;

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!showing) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((at) => (at + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((at) => (at <= 0 ? rows.length - 1 : at - 1));
    }
  }

  // Enter, and the whole reason the finder is a way through rather than a destination: it
  // lands on the highlighted record, and with the list shut it goes where the form was going
  // anyway.
  //
  // `showing` and not `active` alone, which is the bug this reads around: Escape leaves the
  // highlight where it was and only shuts the list, so an enter after it would otherwise
  // open a record the owner is no longer looking at.
  //
  // **The second branch is the plain form's own behaviour, restated**, including the blank
  // field: `preventDefault` has already stopped the browser, so anything this does not do
  // here is a gesture the scripted half swallows and the unscripted half honours — and where
  // the two diverge the unscripted one is right (ADR-0010).
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    const landing = showing ? rows[active] : undefined;
    event.preventDefault();
    setOpen(false);

    if (landing) {
      router.push(landing.href);
      return;
    }

    const asked = term.trim();
    router.push(asked === "" ? "/find" : `/find?q=${encodeURIComponent(asked)}`);
  }

  return (
    // The landmark, so the field is one of the things a screen reader can jump straight to
    // rather than something met on the way through the chrome.
    <search>
      <form
        method="get"
        action="/find"
        className="relative"
        onSubmit={onSubmit}
        // Shut when the focus leaves the field and the list together, and not when it moves
        // between them: a list that closed on its own row being focused would be a list
        // nothing can be chosen from with a keyboard.
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <label htmlFor={`${listId}-field`} className="sr-only">
          Find anything in the library
        </label>
        <Input
          id={`${listId}-field`}
          ref={field}
          name="q"
          type="search"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Find…"
          autoComplete="off"
          role="combobox"
          aria-expanded={showing}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showing && active >= 0 ? `${listId}-${active}` : undefined}
          className="h-8 pr-10 text-sm"
        />

        {/* The shortcut, said out loud on the surface it works on. Hidden from a screen
          reader, which is being told about the field by its label, and hidden on a phone,
          where there is no key to press. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1.5 hidden lg:block"
        >
          <kbd className="font-mono text-eyebrow text-muted-foreground">/</kbd>
        </span>

        {/* Divs and not a list, because the roles are the markup here: a `listbox` of
          `option`s is what tells a screen reader that the field's own value is being chosen
          from these, and a `ul` carrying that role is two conflicting descriptions of one
          thing. The group is a `group` so its heading is read before the rows under it. */}
        {showing ? (
          <div className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-popover p-1.5 shadow-lg">
            <div id={listId} role="listbox" aria-label="Found in the library">
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
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </form>
    </search>
  );
}

/**
 * One suggestion, as a row.
 *
 * A real `Link`, so it is a thing that can be clicked, middle-clicked and opened in a tab
 * like every other way into a record. `onMouseDown` is stopped because the mouse would
 * otherwise take the focus out of the field first, shut the list, and remove the row
 * mid-click.
 */
function Row({
  id,
  suggestion,
  highlighted,
  onHover,
}: {
  id: string;
  suggestion: Suggestion;
  highlighted: boolean;
  onHover: () => void;
}) {
  return (
    <Link
      id={id}
      href={suggestion.href}
      role="option"
      aria-selected={highlighted}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={onHover}
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

/** Whether the key that arrived was typed into something, rather than at the application. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
