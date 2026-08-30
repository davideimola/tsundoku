import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { countWaitingInboxEntries } from "@/core/queries/inbox";
import { listTypes } from "@/core/queries/type";
import { requireOwner } from "@/lib/auth/owner";

// The walking skeleton's one page, and a thin adapter over the core module like every
// page after it: it calls one query and lays out the answer. No SQL, no pool, no
// domain logic (ADR-0002).
//
// It sits in the `(owner)` route group and calls `requireOwner()` before it reads
// anything, which is the shape every page in this app has: the proxy turns a refusal
// into a sign-in screen, and this call is what refuses.
//
// The eight links it opened with are gone: they are the shell's now (`./shell`), on every
// screen instead of only on this one, which is the whole of what #20 was about.
//
// Deliberately plain: what is on screen is the value that came out of Postgres and the
// words needed to read it. It is plain in paper and ink now rather than in whatever
// shadcn shipped with — the tokens in `src/app/globals.css` are the whole difference,
// and this page names no colour of its own. What it is *not* yet is a dashboard.
//
// Rendered per request. There is nothing to prerender — the page's whole point is that
// the value came out of the database a moment ago — and a build that reached for the
// database would put Docker in the way of `pnpm build`.
export const dynamic = "force-dynamic";

export default async function Home() {
  await requireOwner();
  const [types, waiting] = await Promise.all([listTypes(), countWaitingInboxEntries()]);

  return (
    <main className="px-5 py-10 sm:px-8 sm:py-16">
      <h1 className="font-heading text-2xl sm:text-3xl">Home</h1>

      <Card className="mt-8">
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

      {/* What the navigation cannot say. An assistant cannot create a Story, a Volume or
          a Series, so anything it met that I do not have is waiting for me here — and a
          boundary nobody looks at is one that fills up. The eight links that stood in this
          place are the chrome's now, on every screen instead of only on this one. */}
      {waiting > 0 ? (
        <p className="mt-8 text-sm">
          <Link href="/inbox" className="underline underline-offset-4">
            {waiting} waiting for me
          </Link>{" "}
          <span className="text-muted-foreground">to approve or reject.</span>
        </p>
      ) : null}

      <p className="mt-6 text-pretty text-xs leading-relaxed text-muted-foreground">
        {types.length} rows, read from Postgres for this request. Nothing is hosted at this stage:
        the database is the one <code className="font-mono">pnpm db:up</code> runs in Docker, and
        there is no account to open, no OAuth client to create and no token to obtain.
      </p>
    </main>
  );
}
