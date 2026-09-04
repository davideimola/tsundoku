import { Label } from "@/components/ui/label";
import type { Type } from "@/core/queries/type";
import type { ANarrativesSentence, CarriedField } from "./door";
import { THE_TWO_MEDIA, theMediumPressed } from "./door";
import { Picker } from "./fields";

// **THE NARRATIVE HALF OF THE DOOR** (#49 named it, #50 gave it a field of its own): what kind
// of thing it is, and — where a pass actually happened — whether that pass was on paper or on a
// screen.
//
// **It is a file for the reason `./the-object.tsx` is one and no more than that.** Until #50
// this half was a lone `Picker` inline in the page's `else` arm, and one control does not earn a
// file. Two do: the arm now branches on which of the two sentences it is, and a branch inside a
// ternary inside a form is where the object half's fields lived before they moved out here.
// Unlike that file it runs on the server and holds no state — nothing on this form answers
// anything else on it, so there is nothing for the browser to do.
//
// **The medium is asked and the object is not**, which is the whole of #50 and the one thing
// worth stating twice. A pass through no object was recorded as `digital` whatever the owner had
// in their hands; that held while the four sentences stood together and the object half was
// where paper lived, and it stopped holding the moment this half became a door of its own
// (ADR-0019) — a paperback off somebody else's shelf comes through here. What is *not* asked is
// which Volume the pass went through: `CONTEXT.md` says a Pass knows the object «if there was
// one», and that clause is the permission not to ask. A picker over the catalogue here would
// rebuild the object-to-narrative round trip inside the door built to end it, and it would ask
// it of the owner least likely to have an answer — the one saying they read something they do
// not own.
//
// It holds no derivation (`vitest.config.ts`): the two media and which of them the panel opens
// on are `./door.ts`, tested beside themselves, and which sentence asks the question at all is
// the model's own word. What is left in here is a picker, two presses and a `<fieldset>`.

export function TheNarrative({
  said,
  types,
  typed,
}: {
  /** Which of the two sentences about a narrative this panel is, and never one about an object. */
  said: ANarrativesSentence;
  types: Type[];
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
  return (
    <>
      {/* Asked here and not up in the page, because the two sentences about an object ask it
          once for the whole object beside the field that names what is inside it (ADR-0019). */}
      <Picker id="say-type" name="type" label="Type" chosen={typed.type} required any="Which kind?">
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
      {said === "read" ? <TheMedium carried={typed.medium} /> : null}
    </>
  );
}

/**
 * Paper or digital, as two presses side by side rather than as a menu to open.
 *
 * A menu is what the Story's own page uses, and it is right there: that form asks four things
 * and the medium is one row of it. Here it is the only thing being asked beyond what kind of
 * thing it is, both answers are one word, and the screen is held one-handed — so both stand on
 * screen at the size of a thumb and the answer is one tap rather than a tap, a scroll and a tap.
 *
 * The inputs are real radios, hidden and styled through the label beside them, so the group is
 * one tab stop, the arrow keys move within it, the focus ring is the same one every control on
 * this screen draws, and the whole thing posts as a field of a plain form.
 */
function TheMedium({ carried }: { carried: string | undefined }) {
  const pressed = theMediumPressed(carried);

  return (
    <fieldset className="grid gap-1.5">
      {/* The same words the Story's own page asks the question in, which is where the borrowing
          stops: what it opens on differs, and `./door.ts` says why. One question worded two ways
          is two questions to whoever has to answer both. */}
      <legend className="mb-1.5 text-xs text-muted-foreground">On paper or digital</legend>

      <div className="grid grid-cols-2 gap-2">
        {THE_TWO_MEDIA.map((medium) => {
          const id = `say-medium-${medium.value}`;

          return (
            <div key={medium.value}>
              <input
                type="radio"
                id={id}
                name="medium"
                value={medium.value}
                defaultChecked={pressed === medium.value}
                className="peer sr-only"
              />
              {/* Ink on paper for the answer that stands, a hairline for the one that does not:
                  the strongest inversion this palette has, spent on the one thing this panel
                  asks. 44px under a thumb and the desk's 40px from `sm` up, which is every
                  control on this screen. */}
              <Label
                htmlFor={id}
                className="flex h-11 cursor-pointer items-center justify-center rounded-lg border border-input text-base font-normal peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 sm:h-10 md:text-sm"
              >
                {medium.label}
              </Label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
