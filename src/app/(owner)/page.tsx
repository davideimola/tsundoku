import Link from "next/link";
import { Mark } from "@/components/mark";
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
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-16">
      {/* The pile the application is named after, drawn at the size it was designed to
          survive — the same one the tab carries. */}
      <h1 className="flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
        <Mark className="size-5 shrink-0 text-foreground" />
        tsundoku
      </h1>

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

      {/* The screens live behind their own routes. One line each, added by the slice that
          builds one, until there are enough of them to be worth a shell of their own.
          The Reading list comes first because it is the one screen the owner opens to be
          answered rather than to record something. */}
      <ul className="mt-8 space-y-2 text-sm">
        <li>
          <Link href="/reading-list" className="underline underline-offset-4">
            Reading list
          </Link>{" "}
          <span className="text-muted-foreground">
            — what to read next, composed rather than kept.
          </span>
        </li>
        <li>
          <Link href="/stories" className="underline underline-offset-4">
            Stories
          </Link>{" "}
          <span className="text-muted-foreground">— what was read, and what it was worth.</span>
        </li>
        <li>
          <Link href="/collection" className="underline underline-offset-4">
            Collection
          </Link>{" "}
          <span className="text-muted-foreground">
            — the Volumes in the house, and the Stories each one holds.
          </span>
        </li>
        <li>
          <Link href="/series" className="underline underline-offset-4">
            Series
          </Link>{" "}
          <span className="text-muted-foreground">— what am I missing.</span>
        </li>
        <li>
          <Link href="/wishes" className="underline underline-offset-4">
            Wishes
          </Link>{" "}
          <span className="text-muted-foreground">— what to buy, and what it should cost.</span>
        </li>
        <li>
          <Link href="/credits" className="underline underline-offset-4">
            Credits
          </Link>{" "}
          <span className="text-muted-foreground">— who wrote it and who drew it.</span>
        </li>
        <li>
          <Link href="/paths" className="underline underline-offset-4">
            Paths
          </Link>{" "}
          <span className="text-muted-foreground">
            — the routes I chose, and what comes next on each.
          </span>
        </li>
        <li>
          <Link href="/inbox" className="underline underline-offset-4">
            Inbox
          </Link>{" "}
          <span className="text-muted-foreground">
            {/* The count is here rather than only on the screen itself: an assistant cannot
                create a Story, a Volume or a Series, so anything it met that I do not have
                is waiting for me, and a boundary nobody looks at is one that fills up. */}
            {waiting > 0
              ? `— ${waiting} waiting for me to approve or reject.`
              : "— what an assistant asked for, and what I decided."}
          </span>
        </li>
      </ul>

      <p className="mt-6 text-pretty text-xs leading-relaxed text-muted-foreground">
        {types.length} rows, read from Postgres for this request. Nothing is hosted at this stage:
        the database is the one <code className="font-mono">pnpm db:up</code> runs in Docker, and
        there is no account to open, no OAuth client to create and no token to obtain.
      </p>
    </main>
  );
}
