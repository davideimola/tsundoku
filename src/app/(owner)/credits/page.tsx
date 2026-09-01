import Link from "next/link";
import { listCreditedPeople } from "@/core/queries/credit";
import { requireOwner } from "@/lib/auth/owner";
import { rolesSaid } from "./roles";

// The people the library credits, which is the door to the question the whole slice
// exists for: *what have I actually read by Jeph Loeb, before I commit to the omnibus?*
//
// A thin adapter over one query, like every page here (ADR-0002). Deliberately plain, in
// the same paper and ink the rest of the app is set in, with one structural idea of
// its own: **a person is a name, the roles they hold, and how much of them was read** —
// so the row is a colophon line, and the fraction on the right is the only number,
// because it is the only one that answers anything.
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
          , and everything read by them becomes a question you can ask.
        </p>
      ) : (
        <>
          <p className="mt-8 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {people.length} {people.length === 1 ? "person" : "people"}
          </p>

          <ul className="mt-2">
            {people.map((person) => (
              <li key={person.id} className="border-t border-border first:border-t-0">
                <Link
                  href={`/credits/${person.id}`}
                  className="flex items-baseline justify-between gap-4 py-3.5 outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-heading">{person.name}</span>
                    {/* The roles they hold anywhere, in the order a comic is credited in.
                        Mono caps, because it is a vocabulary and not prose. */}
                    <span className="mt-0.5 block truncate font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                      {rolesSaid(person.roles)}
                    </span>
                  </span>
                  {/* The only number on the row, and the one the shelf question turns on:
                      read out of credited. Tabular so the column lines up under itself. */}
                  <span className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                    {person.readCount} / {person.storyCount} read
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-10 max-w-prose text-pretty text-xs leading-relaxed text-muted-foreground">
        Read means it went through a Reading, abandoned included — not that the Story is in the
        library. The word here is Credit, and it is a role rather than a byline: one name on a cover
        presumes a single role and silently drops the artist.
      </p>
    </main>
  );
}
