"use client";

import { useId, useMemo, useRef, useState } from "react";
import { type HeldStory, TheStoriesItHolds } from "@/components/stories-it-holds";
import type { Band } from "@/components/stories-on-offer";
import { PRIORITIES } from "../wishes/shopping";
import {
  A_NARRATIVE_WITH_NO_NAME,
  type CarriedField,
  type NamedNarrative,
  theNarrativeAlreadyStanding,
  theNarrativesInside,
} from "./door";
import { Field, Picker } from "./fields";
import { THE_NARRATIVES_INSIDE } from "./panels";

// **THE OBJECT HALF OF THE DOOR** (#48, ADR-0019): what the object is, where it stands in a
// line, what is inside it, and then either what was paid for it or what is meant to be.
//
// **One component for both sentences about an object, because it is one object.** What a thing
// is does not depend on whether the owner has paid for it, and a second form spelling the
// publisher, the binding and the ISBN again would be the same six fields drifting apart at the
// speed of two files. What differs is the last block, and only the last block: *I bought it*
// ends in a receipt, *I want to buy it* ends in a shopping list.
//
// **It runs in the browser, and that is what #48 bought with ADR-0020** (which supersedes
// ADR-0010 and no longer asks a control for an unscripted twin). Three things on this form
// answer each other as the owner moves through it, and none of them could before:
//
//   1. **the Series picker decides what the list already says** — a line that names a work
//      stands that work in the list, and a line that names none falls through to the volume's
//      own title (`theNarrativeAlreadyStanding`);
//   2. **the Binding picker decides which Type a new narrative arrives as** — a tankōbon holds
//      a Manga and a *spillato* holds a Comic, and the object is in the owner's hands while
//      they are choosing it (`theTypeEachBindingOffers`);
//   3. **the narratives are held until one submission**, because the Volume does not exist yet
//      and it is all or nothing.
//
// The third is the whole reason the component under the rows takes an adapter. On a Volume's
// page each of its acts is a Server Function that writes at once; here the same acts move rows
// around in the browser and nothing is written until the press at the bottom. **The component
// cannot tell the difference and is never told** — it reaches no verb, no id and no URL of its
// own.
//
// **What is submitted is still a plain form.** The rows ride in repeated hidden fields
// (`THE_NARRATIVES_INSIDE`) rather than in a function call, so the press at the bottom is the
// same `<form action={…}>` post it always was, the refusal comes back in the address the way
// every refusal on this screen does, and the verb behind it stays the one door.
//
// It holds no derivation, which is `vitest.config.ts`'s rule: what the row already standing
// says is `./door.ts`, what the field found is banded by `@/components/stories-on-offer`, and
// what is inside the object at submit is `./door.ts` again. What is left in here is a list, a
// counter for the rows that are not records yet, and two pickers that answer each other.

/** A Series as the picker offers it, and the one arrow it carries (#39). */
export type Line = {
  id: string;
  name: string;
  editionLine: string | null;
  publishes: { id: string; title: string } | null;
};

export function TheObject({
  said,
  title,
  bindings,
  lines,
  types,
  typeEachBindingOffers,
  named,
  isbn,
  typed,
  publishedBy,
  find,
}: {
  said: "bought" | "wished";
  /** What the door heard the object is called, which is what the shown default falls back to. */
  title: string;
  bindings: readonly { id: string; name: string }[];
  lines: readonly Line[];
  /** The Types, read from the library rather than enumerated (ADR-0006). */
  types: readonly { id: string; name: string }[];
  /**
   * Which Type a new narrative arrives as, for each Binding and for none at all — the whole
   * table, because the Binding it depends on is a picker on this very form.
   */
  typeEachBindingOffers: Record<string, string | null>;
  /** The rows a refused press came back with, where it did. */
  named: readonly NamedNarrative[];
  isbn: string | undefined;
  /**
   * What each field held on a press that came back refused, where there was one.
   *
   * It is a table rather than the reader `page.tsx` used to hand its own half — a function
   * cannot cross into a component that runs in the browser — and the guarantee is the same one
   * or better: it is keyed by `CarriedField`, so a field read here and left off the list
   * `actions.ts` sends is a type error rather than a box that quietly comes back empty, and the
   * page cannot build it while omitting one.
   */
  typed: Record<CarriedField, string | undefined>;
  publishedBy: string | undefined;
  /** What the catalogue holds under what has been typed, banded by line — a Server Function. */
  find: (term: string) => Promise<Band[]>;
}) {
  // **What the field last answered with, kept because a row is added by id and read by name.**
  // The component's own adapter hands over the ids the owner pressed (`carry`), which is right
  // on a Volume's page — the answer to a write there is the page re-reading its list. Here
  // nothing is written yet, so the list *is* the answer, and it has to be able to print the
  // titles the owner just pressed. The alternative is a second question to the library for
  // names it has already sent.
  const answered = useRef<Band[]>([]);
  const search = async (term: string) => {
    const bands = await find(term);
    answered.current = bands;
    return bands;
  };

  const chosenLine = typed.seriesId ?? "";
  const chosenBinding = typed.binding ?? "";

  const [line, setLine] = useState(chosenLine);
  const [binding, setBinding] = useState(chosenBinding);

  const publishes = useMemo(
    () => lines.find((one) => one.id === line)?.publishes ?? null,
    [lines, line]
  );

  // **The row the list arrives with**, and it is recomputed rather than stored: the owner
  // turning the Series picker is the owner correcting what the object holds, and a stored row
  // would go on saying what the line they first chose published. What they have *said* is the
  // list below, which is stored — and a shown default they have touched is one of those.
  const standing = theNarrativeAlreadyStanding(title, publishes);
  // **What the owner has said, or nothing where they have said nothing yet.** `null` is not an
  // empty list and the difference is the whole of the shown default: until they touch it the
  // list *is* the row above, which follows the line they pick; the moment they rename it, take
  // it off or add to it, what stands there is theirs — including when what they said is that
  // the object holds nothing, which is the press the core refuses.
  const [stated, setStated] = useState<NamedNarrative[] | null>(
    named.length > 0 ? [...named] : null
  );
  const rows = stated ?? (standing ? [standing] : []);

  // What a row that is not a record yet is called, so two of them typed over to read the same
  // thing mid-word are still two rows. It never reaches anything written down.
  const minted = useRef(0);
  const newKey = () => {
    minted.current += 1;
    return `named-${minted.current}`;
  };

  const [typeId, setTypeId] = useState(typed.type ?? typeEachBindingOffers[chosenBinding] ?? "");

  const inside = theNarrativesInside(rows);
  const typeName = types.find((one) => one.id === typeId)?.name;

  /** Say the list, from wherever it stood before the owner touched it. */
  function say(work: (standing: readonly NamedNarrative[]) => NamedNarrative[]) {
    setStated(work(rows));
  }

  return (
    <>
      <Field
        name="publisher"
        label="Publisher"
        defaultValue={typed.publisher ?? publishedBy ?? ""}
        placeholder="Planet Manga"
        required
      />
      <Field
        name="editionLine"
        label="Edition line"
        defaultValue={typed.editionLine ?? ""}
        placeholder="DC Must Have"
      />

      {/* The Binding is what the object in the owner's hands is, and it is the better of the
          two guesses at a Type: a fact rather than a habit. So it is watched. */}
      <Picker
        id="say-binding"
        name="binding"
        label="Binding"
        chosen={binding}
        onChoose={(chosen) => {
          setBinding(chosen);
          const offered = typeEachBindingOffers[chosen];
          if (offered) setTypeId(offered);
        }}
        required
        any="How is it bound?"
      >
        {bindings.map((one) => (
          <option key={one.id} value={one.id}>
            {one.name}
          </option>
        ))}
      </Picker>

      <Field name="language" label="Language" defaultValue={typed.language ?? "it"} required />
      {/* Carried from the lookup where there was one, and typed here otherwise — where a
          printed ISBN's hyphens are refused by the column rather than laundered. The field
          that reads a barcode is the lenient door, and what it hands over is bare digits. */}
      <Field
        name="isbn"
        label="ISBN"
        defaultValue={typed.isbn ?? isbn ?? ""}
        placeholder="9788828765431"
        inputMode="numeric"
      />

      {/* **Both sentences ask which line, and only one of them asks which position.** The line
          is asked for its arrow, which is a fact about the work and true whether or not the
          object has been paid for. A position is a place on the shelf — the core refuses to
          place a Volume the house does not hold, and the ledger is measured against the shelf —
          so an object only wished for is placed when it comes home, and the box for it is not
          drawn here. */}
      <div
        className={`grid gap-4 border-t border-border pt-4 ${said === "bought" ? "sm:grid-cols-[1fr_7rem]" : ""}`}
      >
        <Picker
          id="say-series"
          name="seriesId"
          label="Series"
          chosen={line}
          onChoose={setLine}
          any="In no Series"
        >
          {lines.map((one) => (
            <option key={one.id} value={one.id}>
              {[one.name, one.editionLine].filter(Boolean).join(", ")}
              {one.publishes ? ` — ${one.publishes.title}` : ""}
            </option>
          ))}
        </Picker>
        {said === "bought" ? (
          <Field
            name="seriesNumber"
            label="Position"
            defaultValue={typed.seriesNumber ?? ""}
            placeholder="21"
            inputMode="numeric"
          />
        ) : (
          <p className="text-pretty text-xs text-muted-foreground">
            A line that names a work stands that work in the list below rather than minting a second
            one. Which position it is waits until it comes home: a position of a Series is filled by
            what is on the shelf.
          </p>
        )}
      </div>

      <TheNarrativesInside
        rows={rows}
        types={types}
        typeId={typeId}
        typeName={typeName}
        setTypeId={setTypeId}
        find={search}
        say={say}
        newKey={newKey}
        answered={answered}
      />

      {/* The rows, as the press carries them: the ids and their names, then the titles to
          mint. Repeated fields rather than one encoded field, and named in one place
          (`./panels.ts`) because the action reads back what this writes. */}
      {inside.stories.map((story) => (
        <input
          key={story.storyId}
          type="hidden"
          name={THE_NARRATIVES_INSIDE.story}
          value={story.storyId}
        />
      ))}
      {inside.stories.map((story) => (
        <input
          key={`${story.storyId}-title`}
          type="hidden"
          name={THE_NARRATIVES_INSIDE.storyTitle}
          value={story.title}
        />
      ))}
      {inside.newStories.map((newStory) => (
        <input
          key={newStory}
          type="hidden"
          name={THE_NARRATIVES_INSIDE.newStory}
          value={newStory}
        />
      ))}
      {/* The Type is asked once for the whole object, and it is the component's own box above
          — this is the same answer, on its way to whichever narratives are minted. */}
      <input type="hidden" name="type" value={typeId} />

      {said === "bought" ? (
        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <Field
            name="pricePaid"
            label="Price paid"
            defaultValue={typed.pricePaid ?? ""}
            placeholder="6,50"
            inputMode="decimal"
          />
          <Field
            name="acquiredOn"
            label="Came home"
            type="date"
            defaultValue={typed.acquiredOn ?? ""}
          />
        </div>
      ) : (
        <div className="grid gap-4 border-t border-border pt-4">
          <TheIntentionToBuy typed={typed} />
        </div>
      )}
    </>
  );
}

/**
 * **What is inside the object, said where the object is** — the component the whole tracker is
 * about (`@/components/stories-it-holds`), mounted at the moment the object is catalogued.
 *
 * Its adapter is the other one of the two ADR-0019 names. Every act moves a row in the
 * browser and returns a resolved promise, because the object it is about does not exist yet:
 * the transaction is the press at the bottom of this form. There is no `strike` — there is
 * nothing yet to unmake — and there *is* a `rename`, which is the affordance a shown default
 * needs and a settled row has no business having.
 */
function TheNarrativesInside({
  rows,
  types,
  typeId,
  typeName,
  setTypeId,
  find,
  say,
  newKey,
  answered,
}: {
  rows: readonly NamedNarrative[];
  types: readonly { id: string; name: string }[];
  typeId: string;
  typeName: string | undefined;
  setTypeId: (typeId: string) => void;
  find: (term: string) => Promise<Band[]>;
  say: (work: (standing: readonly NamedNarrative[]) => NamedNarrative[]) => void;
  newKey: () => string;
  /** What the field last answered with, which is where a pressed id finds its name. */
  answered: { current: Band[] };
}) {
  const heading = useId();

  return (
    <section aria-labelledby={heading} className="border-t border-border pt-4">
      <h3 id={heading} className="font-heading text-base">
        What is inside it
      </h3>
      <p className="mt-1 max-w-prose text-pretty text-xs text-muted-foreground">
        One narrative is already here — the work the line publishes, or the object&apos;s own name,
        which you can type over. An omnibus holds several: name them, and they are recorded with the
        object in one act.
      </p>

      <div className="mt-4">
        <TheStoriesItHolds
          held={rows.map(
            (row): HeldStory =>
              row.it === "a-story"
                ? {
                    id: row.storyId,
                    title: row.title,
                    type: row.type,
                    score: null,
                    whyItStands: null,
                  }
                : {
                    id: row.key,
                    title: row.title,
                    // The Type the box above is holding, because that is the Type this row will
                    // be recorded as. It is read back rather than stored on the row: one choice
                    // for the whole object, and three tales inside one comic are comics.
                    type: typeName,
                    score: null,
                    whyItStands: null,
                    rename: true,
                  }
          )}
          types={types}
          typeToOffer={typeId === "" ? null : typeId}
          type={{ chosen: typeId, choose: setTypeId }}
          holds={{
            find,
            carry: async (storyIds) =>
              say((standing) => {
                const offered = new Map(
                  answered.current.flatMap((band) => band.stories.map((story) => [story.id, story]))
                );

                return [
                  ...standing,
                  ...storyIds
                    .filter(
                      (storyId) =>
                        !standing.some((row) => row.it === "a-story" && row.storyId === storyId)
                    )
                    .map((storyId): NamedNarrative => {
                      const story = offered.get(storyId);
                      return {
                        it: "a-story",
                        storyId,
                        // Named off the answer the owner pressed. A press that outlived its
                        // answer cannot happen from the field — it clears on every act — and
                        // the row reads under a name rather than a uuid if it ever did.
                        title: story?.title ?? A_NARRATIVE_WITH_NO_NAME,
                        type: story?.type.name,
                      };
                    }),
                ];
              }),
            mint: async (title) =>
              say((standing) => [...standing, { it: "a-title", key: newKey(), title }]),
            stopCarrying: async (id) =>
              say((standing) =>
                standing.filter((row) => (row.it === "a-story" ? row.storyId : row.key) !== id)
              ),
            rename: async (id, title) =>
              say((standing) =>
                standing.map((row) =>
                  row.it === "a-title" && row.key === id ? { ...row, title } : row
                )
              ),
          }}
        />
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 max-w-prose text-pretty text-sm text-destructive">
          Name at least one narrative. An object you catalogue by hand is one you are looking at, so
          the library asks what is in it rather than guessing.
        </p>
      ) : null}
    </section>
  );
}

/**
 * The end of *I want to buy it*: how soon, what it should cost, and what it costs where the
 * owner is standing.
 *
 * **The three labels are the shopping list's own** (`../wishes/shopping`), read rather than
 * written down again, for the reason every vocabulary on this screen is read (ADR-0006): a
 * priority called *Next* here and *Buying this* on the list it lands on would be one intention
 * with two names. The default is *Soon*, which is the shopping list's default and the honest
 * answer for an object the owner is looking at and has not picked up.
 *
 * Two prices and not one, because a shop is two numbers — what it should cost, decided at a
 * desk, and what it costs on the shelf — and the list bands on the first while the owner acts
 * on the second.
 */
function TheIntentionToBuy({ typed }: { typed: Record<CarriedField, string | undefined> }) {
  return (
    <>
      <Picker id="say-priority" name="priority" label="Priority" chosen={typed.priority ?? "2"}>
        {PRIORITIES.map((priority) => (
          <option key={priority.value} value={priority.value}>
            {priority.name} — {priority.hint}
          </option>
        ))}
      </Picker>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          name="targetPrice"
          label="Target price"
          defaultValue={typed.targetPrice ?? ""}
          placeholder="15,00"
          inputMode="decimal"
        />
        <Field
          name="priceFound"
          label="Price found"
          defaultValue={typed.priceFound ?? ""}
          placeholder="12,90"
          inputMode="decimal"
        />
        <Field name="shop" label="Shop" defaultValue={typed.shop ?? ""} placeholder="Star Shop" />
      </div>
    </>
  );
}
