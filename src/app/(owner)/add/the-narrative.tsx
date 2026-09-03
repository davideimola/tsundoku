import { Label } from "@/components/ui/label";
import type { Type } from "@/core/queries/type";
import type { Medium } from "@/core/verbs/reading";
import type { ANarrativesSentence } from "./door";
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
// which Volume the pass went through: `CONTEXT.md` says a Reading knows the object «if there was
// one», and that clause is the permission not to ask. A picker over the catalogue here would
// rebuild the object-to-narrative round trip inside the door built to end it, and it would ask
// it of the owner least likely to have an answer — the one saying they read something they do
// not own.
//
// It holds no derivation (`vitest.config.ts`): which sentence asks the medium is read off the
// model's own word, and what the sentence promises is `./door.ts`, checked beside itself.

/**
 * **The two media, written out**, where the Type picker beside them reads its vocabulary from
 * the database.
 *
 * A medium is a check constraint rather than a vocabulary that grows — `@/core/verbs/reading`
 * says so at the type, and the migration says so in SQL — so a third value would be a change to
 * the model rather than an insert, and `Medium` here is what makes it one: a fourth word in this
 * list is a type error, not a radio that posts something the verb refuses.
 *
 * This list is not what enforces the two. The verb still refuses anything else in its own prose,
 * which is what a hand-made POST meets.
 */
const THE_TWO_MEDIA: readonly { value: Medium; label: string }[] = [
  { value: "paper", label: "Paper" },
  { value: "digital", label: "Digital" },
];

/**
 * **What a pass arrives on where the owner presses nothing**: digital.
 *
 * The default is here rather than in the verb, and that is deliberate — the silent `digital` in
 * the core was what ADR-0019 took out, and a default written one file down would be the same
 * mistake with a shorter reach. Here it is a radio arriving pressed: visible, one tap from the
 * other answer, and part of what the owner reads before they press.
 *
 * Digital rather than paper because this half is where the object is *absent*: the sentence
 * reached through the object half already said the thing is in the house.
 */
const UNLESS_SAID_OTHERWISE: Medium = "digital";

export function TheNarrative({
  said,
  types,
  chosenType,
  chosenMedium,
}: {
  /** Which of the two sentences about a narrative this panel is, and never one about an object. */
  said: ANarrativesSentence;
  types: Type[];
  /** The Type chosen on a press that came back refused, where there was one. */
  chosenType?: string;
  /** The medium pressed on a press that came back refused, where there was one. */
  chosenMedium?: string;
}) {
  return (
    <>
      {/* Asked here and not up in the page, because the two sentences about an object ask it
          once for the whole object beside the field that names what is inside it (ADR-0019). */}
      <Picker id="say-type" name="type" label="Type" chosen={chosenType} required any="Which kind?">
        {types.map((one) => (
          <option key={one.id} value={one.id}>
            {one.name}
          </option>
        ))}
      </Picker>

      {/* **Only the sentence that records a pass**, which is the model's own word rather than a
          flag on the sentence: a Want carries an intended medium of its own, on the Reading
          list, and nothing was read yet — so asking it here would be this panel answering a
          question the list asks later, and answering it wrong. */}
      {said === "read" ? <TheMedium chosen={chosenMedium} /> : null}
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
function TheMedium({ chosen }: { chosen?: string }) {
  // Read against the two rather than trusted, which is what the panel above does with
  // `?panel=…`: `?medium=banana` in the address arrives as no answer at all, and no answer is
  // the default. It cannot come off this form — it comes off a hand-edited address — and the
  // verb refuses anything else besides.
  const pressed = THE_TWO_MEDIA.some((medium) => medium.value === chosen)
    ? chosen
    : UNLESS_SAID_OTHERWISE;

  return (
    <fieldset className="grid gap-1.5">
      {/* The same words the Story's own page asks it in. One question asked two ways is two
          questions to whoever has to answer both. */}
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
