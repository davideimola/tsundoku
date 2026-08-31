import Link from "next/link";
import { Input } from "@/components/ui/input";
import { type Finding, findInTheLibrary } from "@/core/queries/finder";
import { requireOwner } from "@/lib/auth/owner";
import { cn } from "@/lib/utils";
import { groupFindings, recordHref } from "./kinds";
import { FoundRow, nothingIsCalled, ROW } from "./row";

// THE FINDER, unscripted — **and this screen is the specification** (ADR-0010).
//
// The palette the chrome opens suggests as the owner types, and everything it can reach is
// reachable here without a line of JavaScript running: one `GET`, one query, the same records,
// the same order, the same groups — more of them, in fact, because the palette shows the first
// few of each kind and this shows four times as many. Where the two diverge this one is right,
// which is not a courtesy to a browser with scripts off: it is what the owner uses on a shop's
// signal, and it is what makes the suggestion list safe to have no test.
//
// **It is also where the glyph in the chrome points.** That glyph is an `<a href="/find">`, so
// this screen is what the finder degrades to rather than a page kept beside it for a
// principle.
//
// It is **a way through rather than a destination** (#25), which is why it is not in the
// navigation: the map is the three questions the owner asks, and *find* is how they get to
// an answer rather than one of them. The chrome opens it from beside the mark on every
// screen instead, and `../navigation.ts` is where that exception is declared and walled.
//
// A thin adapter over one query, like every page here (ADR-0002).
export const dynamic = "force-dynamic";

/**
 * How many of each kind the screen asks for.
 *
 * Four times the suggestion list, because this is where the owner comes when five was not
 * enough — and still a number rather than everything: `slam` over a complete Series is
 * twenty objects, and a page that answered with all of them would bury the Series and the
 * Story under the shelf.
 */
const PER_KIND = 20;

type Asked = Record<string, string | string[] | undefined>;

export default async function Find({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const said = await searchParams;
  const asked = typeof said.q === "string" ? said.q : "";
  const term = asked.trim();

  // Blank finds nothing in the core, so this is one call in both cases rather than a branch
  // around it: what changes is the sentence under the field, not whether the library was
  // asked.
  const found = await findInTheLibrary({ term, perKind: PER_KIND });
  const groups = groupFindings(found);

  return (
    <main className="px-5 py-8 sm:px-8 sm:py-12">
      <header>
        <h1 className="font-heading text-2xl sm:text-3xl">Find</h1>
        <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
          One field over the whole library: titles, objects, publishers&rsquo; lines, the people
          credited and your own routes. A fragment is enough, and an accent is optional in either
          direction.
        </p>
      </header>

      {/* A `GET`, so the search is in the URL: linkable, survivable across a refresh, and
          working with nothing running in the browser. The same form the shell's field is,
          without the script over it. */}
      <search className="mt-6 block">
        <form method="get" action="/find" className="flex max-w-md gap-2">
          <label htmlFor="q" className="sr-only">
            What are you looking for?
          </label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={asked}
            placeholder="Jujutsu, Perché, Inoue…"
            autoComplete="off"
            // The one place autofocus is right: the owner arrived on a screen whose whole
            // purpose is this field, having usually pressed enter to get here.
            autoFocus
            className="h-9"
          />
          <button
            type="submit"
            className="h-9 shrink-0 rounded-lg border border-border px-3 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Find
          </button>
        </form>
      </search>

      <p className="mt-3 text-sm text-muted-foreground">{whatItFound(term, found)}</p>

      {groups.length > 0 ? (
        <div className="mt-8 space-y-8">
          {groups.map((group) => (
            <section key={group.kind} aria-labelledby={`found-${group.kind}`}>
              <h2
                id={`found-${group.kind}`}
                className="flex items-baseline gap-3 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground"
              >
                {group.heading}
                <span className="tabular-nums">{group.findings.length}</span>
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
              </h2>

              <ul className="mt-2">
                {group.findings.map((finding) => (
                  <li key={`${finding.kind}-${finding.id}`}>
                    <Row finding={finding} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </main>
  );
}

/**
 * What the field found, said in one line.
 *
 * Three cases and not two: nothing typed is a different state from nothing found, and a
 * screen that answered *no results* to an empty field would be reporting on a question
 * nobody asked.
 */
function whatItFound(term: string, found: Finding[]): string {
  if (term === "") return "Type a word. A fragment of a title, a name, a publisher’s line.";
  if (found.length === 0) return nothingIsCalled(term);

  return `${found.length} ${found.length === 1 ? "record" : "records"} called “${term}”.`;
}

/**
 * One record, as a row: what it is called, and the one word that tells it from another of
 * the same name.
 *
 * A row rather than a tile, because this screen is passed through rather than looked at —
 * the walls are where the library is looked at, and a finder that drew ninety-six covers
 * would be a slower way to the same link.
 */
function Row({ finding }: { finding: Finding }) {
  return (
    <Link
      href={recordHref(finding)}
      className={cn(
        ROW,
        "text-muted-foreground transition-colors outline-none",
        "hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <FoundRow name={finding.name} qualifier={finding.qualifier} />
    </Link>
  );
}
