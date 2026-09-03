import type { Band } from "@/components/stories-on-offer";

// **WHAT AN OBJECT IS SHOWN AS HOLDING, AND WHAT THE OWNER SAYS BACK** — where the silent
// default went (#48, ADR-0019), and every act the list under an object's fields performs.
//
// A file of its own rather than a second half of `./door.ts`, for the reason the core's README
// gives about widening: the door is *what was typed and where the answer leads*, and this is
// *what is inside the object*. They are two questions, and the four sentences the door offers
// are being regrouped in the ticket after this one.
//
// `sayWhatHappened` used to mint a Story from the volume's title whenever no line had named a
// work. It fired **only outside a Series** — with a line the object joined the work the line
// publishes — so the one place it ever ran was the omnibus, the graphic novel and the novel.
// On a novel it is right. On *Batman: Il lungo Halloween* it minted a narrative named after
// the jacket, for an object that carries several tales named nothing like it: the default was
// loudest exactly where it was least likely to be true, and silent.
//
// What replaces it is not its removal. **The same default arrives as a line already standing
// in a list** — the Story the line publishes where there is a line, the volume's own title
// where there is not — so the ordinary case still costs nothing and the omnibus costs one
// gesture. It is here rather than in the core because it is not a fact about the library: it
// is what a screen puts in front of somebody before they have said anything, which is the
// definition of this file.

/**
 * One narrative named inside the object being catalogued, as the screen holds it before
 * anything at all is written.
 *
 * The two shapes are the two kinds of answer, and the difference is whether a record has to
 * appear: a Story the library holds is linked at submit, a title is minted and then linked.
 */
export type NamedNarrative =
  | {
      readonly it: "a-story";
      /** The Story, which is also the row's identity — a narrative is named once. */
      readonly storyId: string;
      readonly title: string;
      /**
       * The Type by name, where the screen was told it. The row the field found carries one;
       * the work a line publishes does not, because a picker over lines knows what each one
       * prints and not what kind of thing that is.
       */
      readonly type?: string;
    }
  | {
      readonly it: "a-title";
      /**
       * What identifies this row, since a title is not yet anything and two of them may be
       * typed over to read the same thing mid-word. It is the screen's own and reaches no
       * record.
       */
      readonly key: string;
      readonly title: string;
    };

/** The name a title row that has been emptied stands under, so the row can still be read. */
export const A_NARRATIVE_WITH_NO_NAME = "Untitled";

/**
 * **The row the list arrives with**: the Story the line publishes where there is a line, and
 * the volume's own title where there is not.
 *
 * `publishes` is what the Series picker already knows about the line the owner chose — the one
 * arrow between a line and a narrative (#39) — so choosing a line changes what the row says
 * rather than what the owner has to type. A line that names no work is the ordinary case and
 * falls through to the title, which is the object's own name and the answer for every novel
 * and every one-off object.
 *
 * `null` where the door has heard no title yet, which is a list with nothing to show rather
 * than a row saying nothing.
 */
export function theNarrativeAlreadyStanding(
  title: string,
  publishes: { id: string; title: string } | null | undefined
): NamedNarrative | null {
  if (publishes) return { it: "a-story", storyId: publishes.id, title: publishes.title };

  const named = title.trim();
  if (named === "") return null;

  return { it: "a-title", key: "the-volumes-own-title", title: named };
}

/**
 * The two lists the submission carries: the Stories named by id, and the titles to mint.
 *
 * **A title with nothing in it is not a narrative**, so it is dropped here rather than refused
 * — the owner emptying the box is on their way to typing something else, and the press that
 * matters is refused by the core in its own words when nothing is left at all. Both lists are
 * folded, because the same narrative named twice is one fact: the field will not offer a Story
 * the rows already hold, but a title typed over to match one already standing can.
 */
export function theNarrativesInside(named: readonly NamedNarrative[]): {
  stories: { storyId: string; title: string }[];
  newStories: string[];
} {
  const stories = new Map<string, string>();
  const newStories = new Map<string, string>();

  for (const one of named) {
    if (one.it === "a-story") {
      stories.set(one.storyId, one.title);
      continue;
    }

    const title = one.title.trim();
    // Folded on the title as a person reads two titles as the same one, which is the rule the
    // field's own enter key is held to (`@/components/stories-on-offer`). The **first**
    // spelling stands, because the row that came later is the accidental one.
    const same = title.toLowerCase();
    if (title !== "" && !newStories.has(same)) newStories.set(same, title);
  }

  return {
    stories: [...stories].map(([storyId, title]) => ({ storyId, title })),
    newStories: [...newStories.values()],
  };
}

/**
 * The rows read back off a refused press, as the owner had them.
 *
 * **A refusal is a sentence about one field and every other field was right** — which is the
 * rule `THE_FIELDS_A_REFUSAL_CARRIES` states for the object, and the narratives are the part
 * of it that would cost the most to lose: a position of the line the house already holds would
 * otherwise answer the owner by making them name an omnibus's three tales again.
 *
 * What comes back is what was submitted, so a Story is a Story and a title is a title. What
 * does not come back is what the field knew about a Story beyond its id and its name — its
 * Type, read off a row that is no longer on the screen — and the row reads without it rather
 * than the screen inventing one.
 */
export function theNarrativesNamedBefore(
  stories: readonly string[],
  storyTitles: readonly string[],
  newStories: readonly string[]
): NamedNarrative[] {
  return [
    ...stories.map(
      (storyId, at): NamedNarrative => ({
        it: "a-story",
        storyId,
        // Paired by position with the ids, which is how they were written. They come apart
        // only if the address was edited by hand, and a row with no name still reads as a row
        // rather than as a uuid: the id is what is about to be recorded either way.
        title: storyTitles[at] ?? A_NARRATIVE_WITH_NO_NAME,
      })
    ),
    ...newStories.map(
      (title, at): NamedNarrative => ({ it: "a-title", key: `named-${at}`, title })
    ),
  ];
}

// **THE FOUR ACTS THE LIST PERFORMS**, and they are here rather than in the component that
// draws them because of the rule `vitest.config.ts` states: **a client component may exist, and
// it may hold no derivation.** On a Volume's page each of these acts is a verb; at cataloguing
// time each is a list becoming another list, which is data in and data out — a function this
// application would still have if React were replaced — so it is tested beside itself and the
// component above it only calls it.

/**
 * What identifies one row on the screen.
 *
 * A Story is identified by the Story, because a narrative is named once. A title is identified
 * by its key and never by what it says, because two titles typed over mid-word may read the
 * same thing for a keystroke and are still two rows.
 */
export function whatIdentifiesARow(named: NamedNarrative): string {
  return named.it === "a-story" ? named.storyId : named.key;
}

/**
 * The rows after a press on what the field found — one row, or a whole band in one press.
 *
 * The names come off `found`, which is the answer the owner pressed: the component hands over
 * the ids they chose, which is right on a Volume's page because the answer to a write there is
 * the page re-reading its own list. Here nothing is written yet, so this list *is* the answer
 * and it has to be able to print what they just pressed.
 *
 * A Story already standing is not added twice, and a row that is somehow not in the answer is
 * kept rather than dropped: an id the owner pressed is a narrative they meant, and a row under
 * a placeholder name is a better answer than a press that did nothing.
 */
export function theRowsAfterAdding(
  rows: readonly NamedNarrative[],
  storyIds: readonly string[],
  found: readonly Band[]
): NamedNarrative[] {
  const offered = new Map(
    found.flatMap((band) => band.stories.map((story) => [story.id, story] as const))
  );

  const added = storyIds
    .filter((storyId) => !rows.some((row) => row.it === "a-story" && row.storyId === storyId))
    .map((storyId): NamedNarrative => {
      const story = offered.get(storyId);
      return {
        it: "a-story",
        storyId,
        title: story?.title ?? A_NARRATIVE_WITH_NO_NAME,
        type: story?.type.name,
      };
    });

  return [...rows, ...added];
}

/** The rows after a narrative the library does not hold is named. */
export function theRowsAfterMinting(
  rows: readonly NamedNarrative[],
  key: string,
  title: string
): NamedNarrative[] {
  return [...rows, { it: "a-title", key, title }];
}

/** The rows after one is taken off: the object does not hold that after all. */
export function theRowsAfterTakingOneOff(
  rows: readonly NamedNarrative[],
  id: string
): NamedNarrative[] {
  return rows.filter((row) => whatIdentifiesARow(row) !== id);
}

/**
 * The rows after a title is typed over.
 *
 * **Only a title, and that is the whole of the affordance**: the shown default is a narrative
 * the library does not hold yet, and correcting the name of one it *does* hold is an Amendment
 * on the narrative itself (ADR-0011). So a row naming a Story is left exactly as it stands.
 */
export function theRowsAfterRenaming(
  rows: readonly NamedNarrative[],
  key: string,
  title: string
): NamedNarrative[] {
  return rows.map((row) => (row.it === "a-title" && row.key === key ? { ...row, title } : row));
}
