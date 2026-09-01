import Link from "next/link";
import { type CreditedPerson, listCreditedPeople } from "@/core/queries/credit";
import { requireOwner } from "@/lib/auth/owner";
import { rolesSaid } from "./roles";

// THE PEOPLE THE LIBRARY CREDITS, which is the door to the question the whole slice exists
// for: *what have I actually read by Jeph Loeb, before I commit to the omnibus?*
//
// One structural idea, and it is the same one it always had: **a person is a name, the roles
// they hold, and how much of them was read.** The row is a colophon line and the fraction is
// the only number on it, because it is the only one that answers anything.
//
// **In the shell now** (#31), which changed one thing: the names spend the width. A column of
// them down the middle of a wide window was the shape this redesign was called to remove, and
// people are the one list in this application with nothing to draw — a person has no jacket,
// no line and no colour — so what the width buys here is not a picture but the whole
// colophon at a glance, three abreast at a desk and one under the other on a phone.
//
// The word is **Credit** and it is a role rather than a byline. `author` presumes a single
// role and silently drops the artist, and this application does not say it anywhere.
//
// A thin adapter over one query, like every page here (ADR-0002).
export const dynamic = "force-dynamic";

export default async function CreditsPage() {
  await requireOwner();

  const people = await listCreditedPeople();

  return (
    <main className="px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        <h1 className="font-heading text-2xl sm:text-3xl">Credits</h1>
        <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
          Who wrote it and who drew it. A Credit is a contribution to a Story in a named role, so
          one person can hold both — and two people usually do.
        </p>
      </header>

      {people.length === 0 ? (
        <p className="mt-8 max-w-prose text-pretty text-sm text-muted-foreground">
          Nobody is credited yet. Neither sheet had a column for it, so this starts empty on
          purpose: credit a writer or an artist on a{" "}
          <Link href="/stories" className="underline underline-offset-4 hover:text-foreground">
            Story
          </Link>
          , and everything they are credited on becomes a question you can ask.
        </p>
      ) : (
        <>
          <p className="mt-8 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
            {people.length} {people.length === 1 ? "person" : "people"}
          </p>

          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {people.map((person) => (
              <li key={person.id}>
                <Person person={person} />
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-10 max-w-prose text-pretty text-xs leading-relaxed text-muted-foreground">
        Read means it went through a Reading, abandoned included — not that the Story is in the
        library. Open a name for the whole body of work, split by the role they held on each thing.
      </p>
    </main>
  );
}

/** One person, as a colophon line: the name, the roles they hold, and how much was read. */
function Person({ person }: { person: CreditedPerson }) {
  return (
    <Link
      href={`/credits/${person.id}`}
      className="flex h-full items-baseline justify-between gap-4 rounded-xl p-4 outline-none ring-1 ring-foreground/10 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0">
        <span className="block truncate font-heading">{person.name}</span>
        {/* The roles they hold anywhere, in the order a comic is credited in — which is what
            their page is banded by. Mono caps, because it is a vocabulary and not prose. */}
        <span className="mt-0.5 block truncate font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
          {rolesSaid(person.roles)}
        </span>
      </span>
      {/* The only number on the row, and the one the shelf question turns on: read out of
          credited. Tabular so the column lines up under itself. */}
      <span className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
        {person.readCount} / {person.storyCount} read
      </span>
    </Link>
  );
}
