import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listTypes } from "@/core/queries/type";

// The walking skeleton's one page, and a thin adapter over the core module like every
// page after it: it calls one query and lays out the answer. No SQL, no pool, no
// domain logic (ADR-0002).
//
// Rendered per request. There is nothing to prerender — the page's whole point is
// that the value on screen came out of Postgres a moment ago — and a build that
// reached for the database would need one to exist, which would put Docker in the way
// of `pnpm build`.
export const dynamic = "force-dynamic";

export default async function Home() {
  const types = await listTypes();

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 sm:py-20">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
          tsundoku
        </p>
        <h1 className="mt-4 text-balance text-2xl leading-snug font-medium sm:text-3xl">
          A single-owner library, for the pile of unread books that keeps growing.
        </h1>
        <p className="mt-4 text-pretty text-muted-foreground">
          What has been read, what it was worth, and what stands on the shelf — kept somewhere an
          assistant can be asked <em>what should I read next</em>.
        </p>
      </header>

      <Card className="mt-12">
        <CardHeader>
          <CardTitle>Type</CardTitle>
          <CardDescription className="text-pretty">
            An attribute of a Story, never a kind of thing, and stored as data rather than written
            into the code. A sixth Type is an insert, not a release.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Two columns because a Type has two audiences: the name the owner reads on
              screen, and the id an external assistant reads over MCP. */}
          <ul className="-my-1">
            {types.map((type) => (
              <li
                key={type.id}
                className="flex items-baseline justify-between gap-4 border-t border-border py-2.5 first:border-t-0"
              >
                <span>{type.name}</span>
                <code className="font-mono text-xs text-muted-foreground">{type.id}</code>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <p className="mt-8 text-pretty text-xs leading-relaxed text-muted-foreground">
        {types.length} rows, read from Postgres for this request. Nothing is hosted at this stage:
        the database is the one <code className="font-mono">pnpm db:up</code> runs in Docker, and
        there is no account to open, no OAuth client to create and no token to obtain.
      </p>
    </main>
  );
}
