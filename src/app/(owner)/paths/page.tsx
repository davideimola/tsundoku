import Link from "next/link";
import { Drawer, OpensDrawer } from "@/components/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listDeclaredConstraints, listPaths, type PathSummary } from "@/core/queries/path";
import { requireOwner } from "@/lib/auth/owner";
import { define } from "./actions";
import { DEFINING_A_PATH } from "./acts";
import { DeclaredConstraints } from "./constraints";

// THE PATHS. Today these are prose cells in a spreadsheet with a `Prossimo` column the
// owner recomputes by hand; this screen exists so that the column is a query and the
// route is rows (#1).
//
// So the design puts **what comes next** where the eye lands and the counts underneath
// it, rather than the other way round. That one line is the whole reason the sheet was
// being maintained.
//
// **A route is an order somebody chose, and this screen must not imply otherwise** (#31).
// It crosses manga, comics and non-fiction wherever the owner pointed it; nothing here
// computes the order, ranks a route or scores one against another. The only derived thing on
// the card is which stop is next, which follows from what has been read.
//
// **In the shell now**, which changed two things. The routes spend the width — three abreast
// at a desk, one under the other on a phone — so a dozen of them are one screen and the
// answer they exist to give is readable without scrolling past it. And defining one is a
// panel off the hero (`@/components/drawer`), the shape the Collection wall and the Series
// ledger already have: the open state is the URL, so it costs no script, `?panel=define` is a
// bookmark, and the back button closes it.
//
// A thin adapter over the core, like every page here (ADR-0002): two queries, laid out.
// Paper and ink, read from the tokens in `src/app/globals.css` and naming no colour of
// its own — the owner's declared constraints and a route's intent are the serif, because
// those are their words and the rest of the screen is the application's.
export const dynamic = "force-dynamic";

type Asked = Record<string, string | string[] | undefined>;

function asked(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

// The one panel this screen has, read against the act it belongs to rather than trusted:
// `?panel=banana` opens nothing, which is the honesty every filter on every wall is held to.
// The name is `./acts`'s: the Server Function behind the form has to send a refusal back
// into this same panel, so one spelling serves both.
//
// This screen narrows nothing, so a panel's address carries the panel and nothing else — and
// deliberately not the answer to the last write, which is about the press that produced it.
const OPENS_AT = `/paths?panel=${DEFINING_A_PATH}`;
const CLOSES_TO = "/paths";

export default async function PathsPage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const params = await searchParams;
  const [paths, constraints] = await Promise.all([listPaths(), listDeclaredConstraints()]);

  // The ones holding over the whole library. A constraint on a route is read on that
  // route, where the owner can see what it is about.
  const global = constraints.filter((constraint) => constraint.path === null);

  const refused = asked(params, "refused");
  const defined = asked(params, "defined");
  // What was just struck, named here because the page that would have said it is gone: a
  // route unmade answers on the screen the owner lands on, or it answers nowhere.
  const struck = asked(params, "struck");
  const panel = asked(params, "panel") === DEFINING_A_PATH ? DEFINING_A_PATH : undefined;
  const active = paths.filter((path) => path.active);
  const aside = paths.filter((path) => !path.active);

  return (
    <main className="px-5 pb-16 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 pt-8 sm:pt-12">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl sm:text-3xl">Paths</h1>
          <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
            A route through Stories, in the order I chose — crossing manga, comics and non-fiction
            wherever the route goes. The order is my judgement, so nothing here computes it, and
            what comes next follows from what I have read rather than from a cell I keep up to date.
          </p>
        </div>

        <OpensDrawer href={OPENS_AT} emphasis="loud">
          Define a Path
        </OpensDrawer>
      </header>

      {/* On the page only where the panel is not standing over it: a refused definition
          comes back with its two fields open, and the sentence is printed in there. */}
      {refused && !panel ? (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {refused}
        </p>
      ) : null}
      {defined ? (
        <p role="status" className="mt-6 rounded-lg bg-muted px-3 py-2 text-sm">
          {defined} is a Path. Put Stories on it in the order you mean to read them.
        </p>
      ) : null}
      {struck ? (
        <p role="status" className="mt-6 rounded-lg bg-muted px-3 py-2 text-sm">
          {struck} is no longer a route. Its stops and anything declared on it went with it;
          everything you read, judged and catalogued is where it was.
        </p>
      ) : null}

      {paths.length === 0 ? (
        <p className="mt-8 max-w-prose text-pretty text-sm text-muted-foreground">
          No Paths yet. <em>Recupero Batman</em>, <em>Angolo Giappone</em>,{" "}
          <em>Technical Leadership</em> — <em>Define a Path</em> is at the top of the screen, and
          then Stories go on it in the order you mean to read them.
        </p>
      ) : (
        <section className="mt-8">
          <h2 className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
            The routes I am walking
          </h2>
          {active.length === 0 ? (
            <p className="mt-4 max-w-prose text-pretty text-sm text-muted-foreground">
              Every route is put aside. The Reading list composes itself from the active ones, so it
              has nothing to compose from — take one up again below.
            </p>
          ) : (
            <ul className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {active.map((path) => (
                <PathCard key={path.id} path={path} />
              ))}
            </ul>
          )}
        </section>
      )}

      {aside.length === 0 ? null : (
        <section className="mt-10">
          <h2 className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
            Put aside
          </h2>
          <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
            Not composed into the Reading list. The order in them is kept.
          </p>
          <ul className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {aside.map((path) => (
              <PathCard key={path.id} path={path} />
            ))}
          </ul>
        </section>
      )}

      <DeclaredConstraints
        constraints={global}
        back="/paths"
        scope="how I want to read"
        placeholder="don't accumulate too many unread books"
      />

      {panel === DEFINING_A_PATH ? (
        <Drawer
          title="Define a Path"
          description="A name, and what the route is for. Stories go on it afterwards, in the order you mean to read them."
          refused={refused}
          closesTo={CLOSES_TO}
        >
          <form action={define} className="grid gap-4">
            <input type="hidden" name="back" value="/paths" />
            <div className="grid gap-1.5">
              <Label htmlFor="define-name" className="text-xs text-muted-foreground">
                Name
              </Label>
              <Input
                id="define-name"
                name="name"
                required
                placeholder="Angolo Giappone"
                autoComplete="off"
                className="h-11 sm:h-10"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="define-intent" className="text-xs text-muted-foreground">
                What it is for
              </Label>
              {/* The intent is read by the assistant that recommends, so the field is the
                  size of a thought rather than of a label. */}
              <textarea
                id="define-intent"
                name="intent"
                rows={3}
                placeholder="privilegiare titoli davvero coerenti con samurai e cultura giapponese"
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 font-serif text-base leading-relaxed outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-prose dark:bg-input/30"
              />
              <p className="text-xs text-muted-foreground">
                Your own words. The recommender reads them to extend the route rather than guess at
                a genre. You can leave it empty and say it later.
              </p>
            </div>

            <Button type="submit" className="h-11 w-full sm:h-10">
              Define it
            </Button>
          </form>
        </Drawer>
      ) : null}
    </main>
  );
}

/** One Path: what comes next on it, then what it is for, then how much is left. */
function PathCard({ path }: { path: PathSummary }) {
  return (
    <li>
      <Link
        href={`/paths/${path.id}`}
        className="flex h-full flex-col rounded-xl p-4 outline-none ring-1 ring-foreground/10 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="font-heading text-lg">{path.name}</span>
          {path.active ? null : (
            <Badge variant="outline" className="shrink-0 text-muted-foreground">
              Put aside
            </Badge>
          )}
        </span>

        {/* The line the spreadsheet kept by hand. Named as an answer, not as a field. */}
        <span className="mt-2 block text-sm text-balance">
          {path.next ? (
            <>
              <span className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
                next{" "}
              </span>
              {path.next.title}
            </>
          ) : (
            <span className="text-muted-foreground">
              {path.stops === 0 ? "No Stories on it yet." : "Walked to the end."}
            </span>
          )}
        </span>

        {path.intent ? (
          <span className="mt-2 block text-pretty font-serif text-prose italic text-muted-foreground">
            {path.intent}
          </span>
        ) : null}

        {/* At the foot of the card whatever else is on it, so a row of routes reads
            along one line rather than stepping with the length of each intent. */}
        <span className="mt-auto block pt-3 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
          {path.stops} {path.stops === 1 ? "Story" : "Stories"} · {path.unread} unread
        </span>
      </Link>
    </li>
  );
}
