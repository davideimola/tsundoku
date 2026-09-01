"use client";

import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { suggestPeople } from "./actions";
import type { SuggestedName } from "./suggestion";

// THE CREDIT PICKER: while the owner types a name, the field suggests the people who
// already exist (#28).
//
// **The reason is duplicates, and they are permanent.** The name is unique on `lower(name)`,
// there is no rename verb and no merge verb (ADR-0012), so a second *Yusuke Murata* is a
// second person for as long as the library stands and splits every answer about him in two.
// The library is about to receive a few hundred proposed Credits. Nothing in the database can
// refuse a misspelling, so the repair is offered here, before it is typed.
//
// **The field is the specification and this is a convenience over it** (ADR-0010). It is an
// `input` carrying the same `name="person"` the plain form always carried, standing inside the
// same plain `POST` to `credit`: a name typed in full is accepted whether the suggestions
// arrived or not — a script that did not load, a shop's signal — and reaches the same verb by
// the same path. What the list adds is the *spelling*, and it adds it by typing into the field
// rather than by sending anything of its own: a chosen row puts the existing name in, and the
// verb reuses the person it names. There is no hidden id, because an id would be a second way
// to the same write that only the scripted half has.
//
// **Enter is the one place the two halves could have diverged, and it does not.** With nothing
// highlighted, enter submits the form — exactly what a browser with no script does. So no row
// is highlighted by default: a half-typed name plus enter must not silently credit somebody
// the owner never chose. The arrow keys are how a row is taken, and taking one is a keystroke
// the owner spent on purpose.
//
// **So there is no derivation in here**, and the list has no test (#28,
// `vitest.config.ts`). What is searched is `suggestCreditedPeople`, which is Seam 1 and
// tested; how a row's roles are said is `./roles.ts`, which is tested beside itself; and a row
// arrives already drawn (`./suggestion.ts`). What is left is a text field, a highlight and a
// keystroke.

/** How long the owner has to stop typing before the library is asked. */
const SETTLE = 140;

/** Nothing highlighted: the state the list opens in, and the one enter submits from. */
const NOTHING = -1;

/**
 * The name field of the Credit form, with the people the library already credits under it.
 *
 * It carries its own `Label` — *Person*, which is the word CONTEXT.md's Credit entry leaves
 * standing — because the label and the field it names are one control, and the list has to be
 * positioned against the field rather than against whatever the page wrapped it in. So it
 * takes nothing: the page puts it in the form and the form does the rest.
 */
export function PersonPicker() {
  const ids = useId();
  const fieldId = `${ids}-person`;
  const listId = `${ids}-people`;

  const [typed, setTyped] = useState("");
  // What has been *chosen* rather than typed. The field then holds a name the library
  // certainly has, so asking again would answer with the one row the owner just took.
  const [chosen, setChosen] = useState(false);
  const [people, setPeople] = useState<SuggestedName[]>([]);
  const [active, setActive] = useState(NOTHING);

  const term = typed.trim();

  // Ask the library, once the owner has stopped typing. A later keystroke drops the answer it
  // was waiting for: two requests in flight come back in whatever order the network gives
  // them, and a stale one landing last is a list that disagrees with the field above it.
  useEffect(() => {
    if (term === "" || chosen) {
      setPeople([]);
      return;
    }

    let current = true;
    const timer = setTimeout(async () => {
      try {
        const found = await suggestPeople(term);
        if (!current) return;
        setPeople(found);
        setActive(NOTHING);
      } catch {
        // A suggestion that did not arrive is a field with no list under it, which is the
        // field this always is. The way through has not moved.
        if (current) setPeople([]);
      }
    }, SETTLE);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [term, chosen]);

  /** Take a row: the spelling that is already in the library goes into the field. */
  function take(name: string) {
    setTyped(name);
    setChosen(true);
    setActive(NOTHING);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && people.length > 0) {
      // The list goes, the name stays. Escape on a field the owner is still filling in must
      // not take what they have typed with it.
      event.preventDefault();
      setPeople([]);
      return;
    }

    if (event.key === "Enter") {
      const landing = people[active];
      // With a row highlighted, enter takes the name; with none, it submits the form — which
      // is what enter in a field does everywhere, and what it does here with no script at all.
      if (landing) {
        event.preventDefault();
        take(landing.name);
      }
      return;
    }

    if (people.length === 0) return;

    // The arrows walk the list and wrap at both ends, the finder's way. From nothing
    // highlighted, down takes the first row and up takes the last.
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((at) => (at + 1) % people.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((at) => (at <= 0 ? people.length - 1 : at - 1));
    }
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={fieldId} className="text-xs text-muted-foreground">
        Person
      </Label>

      {/* The list is positioned against the field rather than laid out under it: a row
          appearing must not move the role picker and the button out from under the owner's
          thumb halfway through filling the form in. */}
      <div className="relative">
        <Input
          id={fieldId}
          name="person"
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            setChosen(false);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setPeople([])}
          placeholder="Yusuke Murata"
          required
          // The browser's own autofill would be a second list over this one, and a phone
          // correcting *Murata* to a word it knows is exactly how a duplicate gets typed.
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          role="combobox"
          aria-expanded={people.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active === NOTHING ? undefined : `${listId}-${active}`}
          className="h-11 sm:h-10"
        />

        {people.length > 0 ? (
          <div
            id={listId}
            role="listbox"
            aria-label="People the library already credits"
            // Capped and scrollable, the finder's way and for a sharper reason: this list
            // hangs off a field in the middle of a form, and on a phone with the keyboard up
            // six rows at a thumb's height would put the last of them behind it.
            className="absolute inset-x-0 top-full z-20 mt-1 max-h-[min(16rem,40vh)] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
          >
            {people.map((who, at) => (
              /* A button, because taking a row is not going anywhere: it types into the field
                 above it.

                 **The press is taken on `mousedown`, and that is a bug that was found rather
                 than a preference.** The field closes its list when it loses the focus, so a
                 row taken on the *click* is a row that has already been unmounted by the blur
                 the same press caused — the list vanishes and nothing is chosen, which is
                 exactly what happened the first time this was pressed. `preventDefault` keeps
                 the focus in the field, which is where the keys belong and, on a phone, what
                 keeps the keyboard up. `onClick` stays beside it for an activation that is not
                 a mouse press — a screen reader's — and taking the same name twice types the
                 same name twice.

                 `tabIndex={-1}` because an option is not a tab stop: the keys that walk this
                 list are the arrows, and tab is how the owner leaves the field for the role
                 beside it. A row in the tab order would be a control the tab key reaches an
                 instant before the blur unmounts it. */
              <button
                key={who.name}
                type="button"
                id={`${listId}-${at}`}
                role="option"
                tabIndex={-1}
                aria-selected={at === active}
                onMouseDown={(event) => {
                  event.preventDefault();
                  take(who.name);
                }}
                onClick={() => take(who.name)}
                className={cn(
                  // Tall enough for a thumb, because this form is filled in one-handed with
                  // the book in the other hand.
                  "flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm",
                  "transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  // **The hover is a hover and never the highlight**, which is a correction
                  // rather than a style: the highlight is what enter takes, so a mouse left
                  // resting over the list while the owner typed would make enter credit
                  // somebody they never chose — the exact divergence from the plain form that
                  // the head of this file promises does not exist. So hovering is CSS, and
                  // `active` is only ever set by the arrow keys.
                  "hover:bg-accent/60 hover:text-accent-foreground",
                  at === active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                )}
              >
                <span className="min-w-0 truncate text-foreground">{who.name}</span>
                {/* The roles they already hold, which is what tells two similar names apart.
                    A vocabulary, so mono caps rather than prose. */}
                <span className="shrink-0 font-mono text-eyebrow uppercase tracking-eyebrow">
                  {who.qualifier}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
