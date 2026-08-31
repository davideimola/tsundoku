import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listMissingVolumes, listSeries, type SeriesLedger } from "@/core/queries/series";
import { requireOwner } from "@/lib/auth/owner";
import { declare } from "./actions";
import { Progress, SeriesName } from "./ledger";
import { Spines } from "./spines";

// SERIES, and the question the screen exists for: **what am I missing.**
//
// So what is at the top is the answer rather than the catalogue: the Series the owner
// decided to complete, each drawn as its own row of spines with the gaps showing. The full
// list of declared Series is under it, because knowing that Naruto is 72 volumes is worth
// having and is not a project.
//
// **In the shell now** (#30), which changes two things and no more. The ledgers spend the
// width instead of standing in a column — at a desk they sit two abreast, which is what makes
// several Series comparable at a glance, and on a phone they are one under the other in the
// order the owner asks about them. And the picture is the spines (`./spines`) rather than the
// grid of numbered cells it was: same derivation, same gaps, drawn as the objects they stand
// for and in the Series' own colour, so a stretch of one colour here is the same stretch the
// Collection wall shows.
//
// Nothing here runs in the browser — the one write on this page is a `POST` to a server
// action, and the screen is a thin adapter over the core (ADR-0002): two queries, laid out.
export const dynamic = "force-dynamic";

type Asked = Record<string, string | string[] | undefined>;

function asked(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export default async function SeriesPage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const params = await searchParams;
  const [missing, all] = await Promise.all([listMissingVolumes(), listSeries()]);

  const refused = asked(params, "refused");
  const declared = asked(params, "declared");

  return (
    <main className="px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        <h1 className="font-heading text-2xl sm:text-3xl">Series</h1>
        <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
          A publisher's ordered sequence of Volumes, held as a ledger: how many are out, whether it
          is over, and therefore what is missing. What was any good is a Rating on a Story, and it
          is not asked here.
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
      {declared ? (
        <p role="status" className="mt-6 rounded-lg bg-muted px-3 py-2 text-sm">
          {declared} is declared. Open it to decide whether you are collecting it.
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
          What I am missing
        </h2>

        {missing.length === 0 ? (
          <p className="mt-4 max-w-prose text-pretty text-sm text-muted-foreground">
            Nothing. Either every Series you are collecting is complete, or you have not decided to
            collect one yet — owning Volumes of a Series does not open the project.
          </p>
        ) : (
          /* Two abreast from `xl` up and no sooner: thirty spines want the width, and two
             half-width rows that both wrap are harder to read than two whole ones under
             each other. */
          <ul className="mt-4 grid gap-8 xl:grid-cols-2">
            {missing.map((series) => (
              <li key={series.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <Link
                    href={`/series/${series.id}`}
                    className="min-w-0 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <SeriesName ledger={series} />
                  </Link>
                  <Progress ledger={series} />
                </div>
                {/* The objects are deliberately not read here. This screen answers *which
                    Series am I short of*, at a glance, over every collected Series at once;
                    a spine's title is a fact about one object and is a tap away on the
                    Series' own page. Reading the shelf of every Series to print titles
                    nobody is looking for here would be the wall this app does not build. */}
                <div className="mt-3">
                  <Spines ledger={series} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <h2 className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
          Every Series declared
        </h2>

        {all.length === 0 ? (
          <p className="mt-4 max-w-prose text-pretty text-sm text-muted-foreground">
            No Series yet. Declare one below — its publisher, its edition, and how many Volumes are
            out.
          </p>
        ) : (
          <ul className="mt-2">
            {all.map((series) => (
              <li key={series.id} className="border-t border-border first:border-t-0">
                <Link
                  href={`/series/${series.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <SeriesName ledger={series} />
                    <span className="ml-2 text-xs text-muted-foreground">{series.publisher}</span>
                  </span>
                  <span className="flex items-baseline gap-3">
                    <Collecting ledger={series} />
                    <Progress ledger={series} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card className="mt-12">
        <CardHeader>
          <CardTitle>Declare a Series</CardTitle>
          <CardDescription className="text-pretty">
            It records what the publisher has done, and nothing about what you intend. Deciding to
            complete a Series is a separate act, on the Series' own page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={declare} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              name="name"
              label="Name"
              placeholder="Death Note"
              required
              className="sm:col-span-2"
            />
            <Field name="publisher" label="Publisher" placeholder="Panini Comics" required />
            <Field name="editionLine" label="Edition line" placeholder="Black Edition" />
            <Field
              name="publishedCount"
              label="Volumes published"
              placeholder="6"
              inputMode="numeric"
              required
            />

            <div className="grid gap-1.5">
              <Label htmlFor="declare-status" className="text-xs text-muted-foreground">
                The Series is
              </Label>
              {/* A native select: on a phone it opens the platform picker, and it submits
                  whether JavaScript ran or not. */}
              <select
                id="declare-status"
                name="status"
                defaultValue="ongoing"
                className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 md:text-sm dark:bg-input/30"
              >
                <option value="ongoing">Ongoing</option>
                <option value="concluded">Concluded</option>
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit" className="h-11 w-full sm:h-10 sm:w-auto sm:px-6">
                Declare it
              </Button>
              <p className="mt-2 max-w-prose text-xs text-muted-foreground">
                Leave the edition line empty for the standard printing. The same name in another
                edition is a second Series with its own count.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

/** Whether the owner decided to complete this Series. The Naruto case, said on screen. */
function Collecting({ ledger }: { ledger: SeriesLedger }) {
  if (!ledger.collectingSince) {
    return <span className="text-xs text-muted-foreground">not collecting</span>;
  }
  return (
    <span className="text-xs">
      {ledger.missing && ledger.missing.length > 0
        ? `${ledger.missing.length} missing`
        : "complete"}
    </span>
  );
}

function Field({
  name,
  label,
  className,
  ...props
}: {
  name: string;
  label: string;
  className?: string;
} & React.ComponentProps<typeof Input>) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={`declare-${name}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={`declare-${name}`} name={name} className="h-10" {...props} />
    </div>
  );
}
