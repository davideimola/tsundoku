import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listDeclaredConstraints, listPaths, type PathSummary } from "@/core/queries/path";
import { requireOwner } from "@/lib/auth/owner";
import { define } from "./actions";
import { DeclaredConstraints } from "./constraints";

// THE PATHS. Today these are prose cells in a spreadsheet with a `Prossimo` column the
// owner recomputes by hand; this screen exists so that the column is a query and the
// route is rows (#1).
//
// So the design puts **what comes next** where the eye lands and the counts underneath
// it, rather than the other way round. That one line is the whole reason the sheet was
// being maintained.
//
// A thin adapter over the core, like every page here (ADR-0002): two queries, laid out.
// Monochrome, shadcn's own tokens, and no design system invented on top of them.
export const dynamic = "force-dynamic";

type Asked = Record<string, string | string[] | undefined>;

function asked(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export default async function PathsPage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const params = await searchParams;
  const [paths, constraints] = await Promise.all([listPaths(), listDeclaredConstraints()]);

  // The ones holding over the whole library. A constraint on a route is read on that
  // route, where the owner can see what it is about.
  const global = constraints.filter((constraint) => constraint.path === null);

  const refused = asked(params, "refused");
  const defined = asked(params, "defined");
  const active = paths.filter((path) => path.active);
  const aside = paths.filter((path) => !path.active);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        <Link
          href="/"
          className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
        >
          tsundoku / paths
        </Link>
        <h1 className="mt-6 font-heading text-2xl sm:text-3xl">Paths</h1>
        <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
          A route through Stories, in the order I chose — crossing manga, comics and non-fiction
          wherever the route goes. The order is my judgement, so nothing here computes it, and what
          comes next follows from what I have read rather than from a cell I keep up to date.
        </p>
      </header>

      {refused ? (
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

      {paths.length === 0 ? (
        <p className="mt-8 max-w-prose text-pretty text-sm text-muted-foreground">
          No Paths yet. <em>Recupero Batman</em>, <em>Angolo Giappone</em>,{" "}
          <em>Technical Leadership</em> — name one below and place Stories on it.
        </p>
      ) : (
        <ul className="mt-8">
          {active.map((path) => (
            <PathRow key={path.id} path={path} />
          ))}
        </ul>
      )}

      {aside.length === 0 ? null : (
        <section className="mt-10">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Put aside
          </h2>
          <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
            Not composed into the Reading list. The order in them is kept.
          </p>
          <ul className="mt-4">
            {aside.map((path) => (
              <PathRow key={path.id} path={path} />
            ))}
          </ul>
        </section>
      )}

      <details className="group mt-10 rounded-xl ring-1 ring-foreground/10">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden">
          Define a Path
          <span className="ml-2 text-muted-foreground group-open:hidden">
            — a name, and what it is for
          </span>
        </summary>

        <form action={define} className="grid gap-4 border-t border-border p-4">
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
              className="h-10"
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
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            />
            <p className="text-xs text-muted-foreground">
              Your own words. The recommender reads them to extend the route rather than guess at a
              genre. You can leave it empty and say it later.
            </p>
          </div>

          <div>
            <Button type="submit" className="h-11 w-full sm:h-10 sm:w-auto sm:px-6">
              Define it
            </Button>
          </div>
        </form>
      </details>

      <DeclaredConstraints
        constraints={global}
        back="/paths"
        scope="how I want to read"
        placeholder="don't accumulate too many unread books"
      />
    </main>
  );
}

/** One Path: what comes next on it, then what it is, then how much is left. */
function PathRow({ path }: { path: PathSummary }) {
  return (
    <li className="border-t border-border first:border-t-0">
      <Link
        href={`/paths/${path.id}`}
        className="block py-4 outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
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
        <span className="mt-1.5 block text-sm">
          {path.next ? (
            <>
              <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
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
          <span className="mt-1.5 block max-w-prose text-pretty text-sm italic text-muted-foreground">
            {path.intent}
          </span>
        ) : null}

        <span className="mt-2 block font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          {path.stops} {path.stops === 1 ? "Story" : "Stories"} · {path.unread} unread
        </span>
      </Link>
    </li>
  );
}
