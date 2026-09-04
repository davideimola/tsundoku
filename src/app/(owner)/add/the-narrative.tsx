"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import type { Medium } from "@/core/queries/medium";
import type { Type } from "@/core/queries/type";
import type { ANarrativesSentence, CarriedField } from "./door";
import { theMediumPressed } from "./door";
import { Picker } from "./fields";

// **THE NARRATIVE HALF OF THE DOOR** (#49 named it, #50 gave it a field of its own): what kind
// of thing it is, and — where a pass actually happened — what the owner went through it by.
//
// **It is a file for the reason `./the-object.tsx` is one and no more than that.** Until #50
// this half was a lone `Picker` inline in the page's `else` arm, and one control does not earn a
// file. Two do: the arm now branches on which of the two sentences it is, and a branch inside a
// ternary inside a form is where the object half's fields lived before they moved out here.
//
// **It runs in the browser now, and #63 is why** (ADR-0020). The Type decides which media are
// offered — paper and digital for what is printed, the consoles for what is played — so the two
// controls answer each other and one of them has to know what the other says. The screen cannot
// ask the server which Type the owner is about to pick, so it is handed the **whole table** and
// reads off it as the picker turns, which is the shape `theTypeEachBindingOffers` already gave
// the object half. One field that changes contents, and never a second field standing dead
// beside it.
//
// **The write does not depend on any of that** (ADR-0010). With nothing running, the panel
// stands as the server rendered it: no Type chosen, so every medium there is stands in front of
// the owner — the query's own fallback rather than a special case written here — and one of them
// posts through a plain form to a Server Function. Turning the Type picker then narrows nothing,
// which costs a longer list and no write.
//
// **The medium is asked and the object is not**, which is the whole of #50 and the one thing
// worth stating twice. A pass through no object was recorded as `digital` whatever the owner had
// in their hands; that held while the four sentences stood together and the object half was
// where paper lived, and it stopped holding the moment this half became a door of its own
// (ADR-0019) — a paperback off somebody else's shelf comes through here, and so does a game
// played on a console. What is *not* asked is which Volume the pass went through: `CONTEXT.md`
// says a Pass knows the object «if there was one», and that clause is the permission not to ask.
// A picker over the catalogue here would rebuild the object-to-narrative round trip inside the
// door built to end it, and it would ask it of the owner least likely to have an answer — the
// one saying they read something they do not own.
//
// It holds no derivation (`vitest.config.ts`): which media a Type offers is a core query, which
// of them the field opens on is `theMediumPressed` in `./door.ts`, tested beside itself, and
// which sentence asks the question at all is the model's own word. What is left in here is two
// controls and the state that lets one of them hear the other.

export function TheNarrative({
  said,
  types,
  mediaEachTypeOffers,
  typed,
}: {
  /** Which of the two sentences about a narrative this panel is, and never one about an object. */
  said: ANarrativesSentence;
  types: Type[];
  /**
   * **Which media each Type offers, as the whole table** (`theMediaEachTypeOffers`, #63), with
   * the empty string for the Type nobody has chosen yet.
   *
   * It is keyed for every Type the picker above offers, so there is nothing to fall back to
   * here: a Type the library has no rule for was already answered for in the core, with the
   * whole vocabulary rather than with an empty picker.
   */
  mediaEachTypeOffers: Record<string, Medium[]>;
  /**
   * **What a refused press came back carrying**, as the whole table rather than as two loose
   * strings.
   *
   * It is the same table the object half is handed, off the same one list both halves spell
   * (`THE_FIELDS_A_REFUSAL_CARRIES`), and that is the point: a field named by hand here is a
   * field the action sends and this panel silently drops, which is the drift that list exists
   * against.
   */
  typed: Record<CarriedField, string | undefined>;
}) {
  const [typeId, setTypeId] = useState(typed.type ?? "");
  const offered = mediaEachTypeOffers[typeId] ?? [];
  // **What the owner has pressed, reconciled every time the Type turns.** Not stored raw: a
  // manga read on paper, corrected to a Videogame, cannot go on saying paper — and a game on a
  // Switch, corrected back to Manga, cannot either. `theMediumPressed` is the one rule for both
  // moments, and it is the same one the server rendered this panel with.
  const [pressed, setPressed] = useState(() => theMediumPressed(typed.medium, offered));

  return (
    <>
      {/* Asked here and not up in the page, because the two sentences about an object ask it
          once for the whole object beside the field that names what is inside it (ADR-0019).
          It is watched for the reason the object half watches the Binding: it decides
          something the moment it is turned rather than at submit. */}
      <Picker
        id="say-type"
        name="type"
        label="Type"
        chosen={typeId}
        onChoose={(chosen) => {
          setTypeId(chosen);
          setPressed((was) =>
            theMediumPressed(was ?? undefined, mediaEachTypeOffers[chosen] ?? [])
          );
        }}
        required
        any="Which kind?"
      >
        {types.map((one) => (
          <option key={one.id} value={one.id}>
            {one.name}
          </option>
        ))}
      </Picker>

      {/* **Only the sentence that records a pass**, which is the model's own word rather than a
          flag on the sentence: a Want carries an intended medium of its own, on the Pile
          list, and nothing was read yet — so asking it here would be this panel answering a
          question the list asks later, and answering it wrong. */}
      {said === "read" ? (
        <TheMedium offered={offered} pressed={pressed} onPress={setPressed} />
      ) : null}
    </>
  );
}

/**
 * The media the Type offers, as presses side by side rather than as a menu to open.
 *
 * A menu is what the Story's own page uses, and it is right there: that form asks four things
 * and the medium is one row of it. Here it is the only thing being asked beyond what kind of
 * thing it is, every answer is a word or two, and the screen is held one-handed — so they stand
 * on screen at the size of a thumb and the answer is one tap rather than a tap, a scroll and a
 * tap.
 *
 * **The row wraps rather than counting.** It was two presses in a fixed pair of columns while
 * there were two media; there are two, three or five now depending on what is in front of the
 * owner, and a fixed grid leaves a console alone in a half-width cell. Each press asks for the
 * width of the longest console name and then shares out whatever is left, so the printed pair
 * still stands side by side and the consoles fall into rows that fill.
 *
 * The inputs are real radios, invisible and styled through the label beside them, so the group
 * is one tab stop, the arrow keys move within it, the focus ring is the same one every control
 * on this screen draws, and the whole thing posts as a field of a plain form.
 *
 * **The radio is laid over its label rather than hidden beside it**, which is the one detail
 * worth knowing here. The group is `required` now that it can open on nothing at all, and a
 * browser refusing a press points its own sentence at the control that is empty — so that
 * control has to be a box the size of the thing the owner is looking at, and a screen-reader-only
 * radio is one pixel in the corner with nothing beside it to read. `required` bites only where a
 * script is running: with nothing running the whole vocabulary is offered and one of it is
 * always pressed, so the press goes through as it did before (ADR-0010).
 */
function TheMedium({
  offered,
  pressed,
  onPress,
}: {
  offered: readonly Medium[];
  pressed: string | null;
  onPress: (medium: string) => void;
}) {
  return (
    <fieldset className="grid gap-1.5">
      {/* The same words the Story's own page asks the question in, which is where the borrowing
          stops: what each opens on differs, and `./door.ts` says why. One question worded two
          ways is two questions to whoever has to answer both — and *on paper or digital*, which
          is what both used to say, stopped being the question the day a console could answer
          it. */}
      <legend className="mb-1.5 text-xs text-muted-foreground">How you went through it</legend>

      <div className="flex flex-wrap gap-2">
        {offered.map((medium) => {
          const id = `say-medium-${medium.id}`;

          return (
            <div key={medium.id} className="relative flex-1 basis-32">
              <input
                type="radio"
                id={id}
                name="medium"
                value={medium.id}
                required
                checked={pressed === medium.id}
                onChange={() => onPress(medium.id)}
                className="peer absolute inset-0 m-0 h-full w-full cursor-pointer appearance-none rounded-lg opacity-0"
              />
              {/* Ink on paper for the answer that stands, a hairline for the ones that do not:
                  the strongest inversion this palette has, spent on the one thing this panel
                  asks. 44px under a thumb and the desk's 40px from `sm` up, which is every
                  control on this screen — a floor rather than a height, so *Nintendo Switch*
                  takes two lines instead of being clipped. */}
              <Label
                htmlFor={id}
                className="flex min-h-11 cursor-pointer items-center justify-center text-balance rounded-lg border border-input px-3 py-2 text-center text-base font-normal leading-snug peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 sm:min-h-10 md:text-sm"
              >
                {medium.name}
              </Label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
