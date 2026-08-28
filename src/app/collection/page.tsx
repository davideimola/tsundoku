import Link from "next/link";
import { acquire, release } from "@/app/collection/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listBindings } from "@/core/queries/binding";
import { type CollectionVolume, searchCollection } from "@/core/queries/collection";

// THE COLLECTION, and the screen this whole slice exists for: *do I already have this?*
// asked standing in a shop, one-handed, on the shop's signal. So the phone is the target
// and the desktop is the same screen with more air — never the other way round.
//
// Three consequences, and they are the design rather than a limitation:
//
// - **Nothing here runs in the browser.** The search is a `GET` form and the two writes
//   are `POST`s to server actions, so the screen works with no JavaScript executing, and
//   a search is a URL the owner can bookmark or send themselves. There is no client
//   component in this repo and this screen did not need to be the first.
// - **The search sits above the list and stays there** while the list scrolls. It is the
//   question; the list is only the answer.
// - **Binding is the one thing said loudly** about a Volume, because it is what tells two
//   editions of one story apart — owning *Batman: Il lungo Halloween* in the Must Have is
//   a different fact from owning it in the omnibus, and it is the fact the owner is in
//   the shop to check.
//
// A thin adapter over the core, like every page here (ADR-0002): it calls two queries,
// lays out the answer, and holds no SQL and no rule about what a Volume may be.
export const dynamic = "force-dynamic";

type Asked = Record<string, string | string[] | undefined>;

/** One asked-for value, as a string, or nothing. */
function asked(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export default async function CollectionPage({ searchParams }: { searchParams: Promise<Asked> }) {
  const params = await searchParams;
  const filter = {
    title: asked(params, "title"),
    publisher: asked(params, "publisher"),
    binding: asked(params, "binding"),
  };
  const narrowed = Boolean(filter.title || filter.publisher || filter.binding);

  const [volumes, owned, bindings] = await Promise.all([
    searchCollection(filter),
    searchCollection({}),
    listBindings(),
  ]);

  const refused = asked(params, "refused");
  const acquired = asked(params, "acquired");
  const released = asked(params, "released");

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        <Link
          href="/"
          className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
        >
          tsundoku
        </Link>
        <h1 className="mt-6 font-heading text-2xl sm:text-3xl">Collection</h1>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          The Volumes physically in the house. Not what has been read, and not what is wanted — what
          is on the shelf.
        </p>
      </header>

      {/* Sticky because the answer is read while scrolling and the question is what the
          owner keeps changing. `top-0` on a phone puts it under the thumb. */}
      <search className="sticky top-0 z-10 -mx-5 mt-6 border-b border-border bg-background/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <form action="/collection" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="grid gap-1.5">
            <Label htmlFor="search-title" className="text-xs text-muted-foreground">
              Title
            </Label>
            <Input
              id="search-title"
              name="title"
              defaultValue={filter.title ?? ""}
              placeholder="Slam Dunk"
              autoComplete="off"
              className="h-10"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="search-publisher" className="text-xs text-muted-foreground">
              Publisher
            </Label>
            <Input
              id="search-publisher"
              name="publisher"
              defaultValue={filter.publisher ?? ""}
              placeholder="Panini"
              autoComplete="off"
              className="h-10"
            />
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="search-binding" className="text-xs text-muted-foreground">
              Binding
            </Label>
            {/* A native select rather than a scripted one: on a phone it opens the
                platform picker, and it submits with the form whether JavaScript ran or
                not. The Bindings come out of the database — the six are rows, and a
                seventh must appear here without this file being touched (ADR-0006). */}
            <select
              id="search-binding"
              name="binding"
              defaultValue={filter.binding ?? ""}
              className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            >
              <option value="">Any</option>
              {bindings.map((binding) => (
                <option key={binding.id} value={binding.id}>
                  {binding.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2 sm:col-span-3">
            <Button type="submit" className="h-10 flex-1 sm:flex-none sm:px-6">
              Search
            </Button>
            {narrowed ? (
              <Link
                href="/collection"
                className="inline-flex h-10 items-center px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Show everything
              </Link>
            ) : null}
          </div>
        </form>
      </search>

      {refused ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {refused}
        </p>
      ) : null}
      {acquired ? (
        <p role="status" className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
          {acquired} is in the Collection.
        </p>
      ) : null}
      {released ? (
        <p role="status" className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
          {released || "That Volume"} left the house. Its record is kept.
        </p>
      ) : null}

      <p className="mt-6 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {narrowed
          ? `${volumes.length} of ${owned.length} ${owned.length === 1 ? "Volume" : "Volumes"}`
          : `${owned.length} ${owned.length === 1 ? "Volume" : "Volumes"}`}
      </p>

      {volumes.length === 0 ? (
        <p className="mt-4 text-pretty text-sm text-muted-foreground">
          {narrowed
            ? "Nothing owned matches that. Which is the answer worth having in a shop — widen the search to be sure, then buy it."
            : "Nothing on the shelf yet. Record the Volume in your hand below."}
        </p>
      ) : (
        <ul className="mt-2">
          {volumes.map((volume) => (
            <VolumeRow key={volume.id} volume={volume} />
          ))}
        </ul>
      )}

      <details className="group mt-10 rounded-xl ring-1 ring-foreground/10">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden">
          Record a Volume
          <span className="ml-2 text-muted-foreground group-open:hidden">
            — publisher, Binding, what it cost
          </span>
        </summary>

        {/* No medium is asked for, and there is none to ask for: digital ownership is not
            modelled, so an owned ebook is not a thing this form could record even if it
            offered a box. A book read on a screen is a Reading. */}
        <form action={acquire} className="grid gap-4 border-t border-border p-4 sm:grid-cols-2">
          <Field
            name="title"
            label="Title"
            placeholder="Slam Dunk 1"
            required
            className="sm:col-span-2"
          />
          <Field name="publisher" label="Publisher" placeholder="Planet Manga" required />
          <Field name="editionLine" label="Edition line" placeholder="DC Must Have" />

          <div className="grid gap-1.5">
            <Label htmlFor="acquire-binding" className="text-xs text-muted-foreground">
              Binding
            </Label>
            <select
              id="acquire-binding"
              name="binding"
              required
              className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            >
              {bindings.map((binding) => (
                <option key={binding.id} value={binding.id}>
                  {binding.name}
                </option>
              ))}
            </select>
          </div>

          <Field name="language" label="Language" placeholder="it" required />
          <Field name="pricePaid" label="Price paid" placeholder="6.50" inputMode="decimal" />
          <Field name="purchaseDate" label="Purchase date" type="date" />
          <Field name="isbn" label="ISBN" placeholder="9788828765431" inputMode="numeric" />

          <div className="sm:col-span-2">
            <Button type="submit" className="h-10 w-full sm:w-auto sm:px-6">
              Record it
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              A language is a code — <code className="font-mono">it</code>,{" "}
              <code className="font-mono">en</code>, <code className="font-mono">ja</code>. Leave
              the price and the date empty where the receipt is gone.
            </p>
          </div>
        </form>
      </details>
    </main>
  );
}

/** One Volume: the title to recognise it by, and the object's facts under it. */
function VolumeRow({ volume }: { volume: CollectionVolume }) {
  const under = [volume.publisher, volume.editionLine].filter(Boolean).join(" · ");

  return (
    <li className="border-t border-border first:border-t-0">
      {/* A disclosure rather than a row of controls: the list stays scannable at arm's
          length, and releasing a Volume — which nothing in this slice undoes — takes a
          deliberate second tap rather than one mis-aimed thumb. */}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 py-3 marker:hidden">
          <span className="min-w-0">
            <span className="block truncate font-medium">{volume.title}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{under}</span>
          </span>
          <Badge variant="outline" className="shrink-0">
            {volume.binding.name}
          </Badge>
        </summary>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 pb-4 text-xs sm:grid-cols-4">
          <Fact term="Price paid" detail={volume.pricePaid ? `€ ${volume.pricePaid}` : "—"} />
          <Fact term="Bought" detail={volume.purchaseDate ?? "—"} />
          <Fact term="Language" detail={volume.language} />
          <Fact term="ISBN" detail={volume.isbn ?? "—"} mono />
        </dl>

        <form action={release} className="pb-4">
          <input type="hidden" name="volumeId" value={volume.id} />
          <input type="hidden" name="title" value={volume.title} />
          <Button type="submit" variant="destructive" size="sm" className="h-9">
            Release it
          </Button>
          <span className="ml-3 text-xs text-muted-foreground">
            Sold, given away or lost. The Collection stops claiming it; the record stays.
          </span>
        </form>
      </details>
    </li>
  );
}

function Fact({ term, detail, mono }: { term: string; detail: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{term}</dt>
      <dd className={mono ? "font-mono" : undefined}>{detail}</dd>
    </div>
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
      <Label htmlFor={`acquire-${name}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={`acquire-${name}`} name={name} className="h-10" {...props} />
    </div>
  );
}
