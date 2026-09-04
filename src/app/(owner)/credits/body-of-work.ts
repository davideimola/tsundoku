import type { CreditedStory, CreditRole, PersonCredits } from "@/core/queries/credit";

// **A person's whole body of work, split by the role they held on each thing** (#31) — which
// is the one structural idea on their page, and it is a screen's own derivation rather than
// a second query: the core already hands over everything they are credited on, and how it is
// banded is the screen's, exactly as the Story wall's four shelves are (`../stories/page.tsx`).
//
// It is a file rather than a lump inside the page so that it can be tested beside itself,
// under the licence `vitest.config.ts` states: data in, data out, and a function this
// application would still have if React were replaced.
//
// Two decisions are made here and nowhere else.
//
//   1. **The core's split is not the screen's.** `read` and `notRead` answer *what have I
//      read by them* and the MCP door reads them that way; the page asks *what did they do
//      here*, and that is the role. So the two lists are folded back into one and cut along
//      the other axis — and nothing may fall between them on the way, which is what the
//      first test is about. Where the owner stands with each Story survives on the tile, as
//      the state it is drawn with.
//   2. **A Story is in every band whose role they held on it.** ONE wrote One-Punch Man and
//      both wrote *and drew* Mob Psycho 100, so that Story is under *As Writer* and under
//      *As Artist*. That is not a duplicate — it is the two facts the word Credit exists to
//      keep apart, and a screen showing it once would have to pick a role to drop.
//
// Nothing is imported but types, which are erased: this is reached from a server component
// and it holds no query, no colour and no markup.

/** One band of a person's work: what they did in one role, and how much of it was read. */
export type BandOfWork = {
  role: CreditRole;
  /** How the band is headed. *As Writer* — the role, said as the thing they were on it. */
  title: string;
  /** Everything they are credited on in that role, by title. */
  stories: CreditedStory[];
  /**
   * How many of them went through a Pass, abandoned included.
   *
   * The same reading of the word the Credits list counts by — it is `readingCount` and never
   * the derived state, because *read* here means opened at all and the state says which of
   * the four opening it led to.
   */
  read: number;
};

/**
 * A person's work, banded by role, in the order a comic is credited in.
 *
 * An empty band is dropped rather than headed over nothing, the way the Story wall drops
 * one: it cannot arise from the core, which reads a person's roles off their Credits, and it
 * can the moment anything else hands this a role they hold nowhere.
 */
export function bodyOfWork(person: PersonCredits): BandOfWork[] {
  // By title over the two lists folded together, which is the order both of them already
  // arrive in and the order every wall in this application stands in: the band answers
  // *what of theirs is there* by being readable.
  const everything = [...person.read, ...person.notRead].sort((one, other) =>
    one.title.localeCompare(other.title)
  );

  return person.roles
    .map((role) => {
      const stories = everything.filter((story) => story.roles.some((held) => held.id === role.id));

      return {
        role,
        title: `As ${role.name}`,
        stories,
        read: stories.filter((story) => story.readingCount > 0).length,
      };
    })
    .filter((band) => band.stories.length > 0);
}
