import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listMissingVolumes, listSeries, type SeriesLedger } from "@/core/queries/series";
import { requireOwner } from "@/lib/auth/owner";
import { declare } from "./actions";
import { Completeness, Progress, SeriesName } from "./completeness";

// SERIES, and the question the screen exists for: **what am I missing.**
//
// So what is at the top is the answer rather than the catalogue: the Series the owner
// decided to complete, each with its gaps. The full list of declared Series is under it,
// because knowing that Naruto is 72 volumes is worth having and is not a project.
//
// Deliberately plain, and the same house style as the Collection: shadcn's own tokens,
// nothing invented, a phone first and a desktop as the same screen with more air. Nothing
// here runs in the browser — the one write on this page is a `POST` to a server action.
//
// A thin adapter over the core (ADR-0002): two queries, laid out.
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
    <main className="mx-auto w-full max-w-2xl px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        <Link
          href="/"
          className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
        >
          tsundoku
        </Link>
        <h1 className="mt-6 font-heading text-2xl sm:text-3xl">Series</h1>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
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
        <h2 className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
          What I am missing
        </h2>

        {missing.length === 0 ? (
          <p className="mt-4 text-pretty text-sm text-muted-foreground">
            Nothing. Either every Series you are collecting is complete, or you have not decided to
            collect one yet — owning Volumes of a Series does not open the project.
          </p>
        ) : (
          <ul className="mt-4 space-y-6">
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
                <div className="mt-3">
                  <Completeness
                    publishedCount={series.publishedCount}
                    missing={series.missing ?? []}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <h2 className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
          Every Series declared
        </h2>

        {all.length === 0 ? (
          <p className="mt-4 text-pretty text-sm text-muted-foreground">
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
          <form action={declare} className="grid gap-4 sm:grid-cols-2">
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

            <div className="sm:col-span-2">
              <Button type="submit" className="h-11 w-full sm:h-10 sm:w-auto sm:px-6">
                Declare it
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
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
