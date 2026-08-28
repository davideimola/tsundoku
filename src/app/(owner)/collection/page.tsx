import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Binding, listBindings } from "@/core/queries/binding";
import {
  type CataloguedVolumeOutsideTheCollection,
  type CollectionVolume,
  countCollection,
  listCataloguedOutsideTheCollection,
  searchCollection,
} from "@/core/queries/collection";
import { type CarriedStory, listStoriesInVolumes } from "@/core/queries/story-to-volume";
import { listTypes, type Type } from "@/core/queries/type";
import { requireOwner } from "@/lib/auth/owner";
import { acquire, catalogue, release } from "./actions";

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
// **The screen has two registers now, and the difference between them is the point**
// (ADR-0007). The Collection is the solid list: objects in the house. Under it, in a
// dashed frame, is the other half of the catalogue — objects the library knows and the
// owner does not have. Nothing about the frame is decoration: a hairline that is not
// continuous is how *not on the shelf* reads at a glance, and the answer the owner is in a
// shop for is which of the two lists a title is in.
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
  await requireOwner();

  const params = await searchParams;
  const filter = {
    title: asked(params, "title"),
    publisher: asked(params, "publisher"),
    binding: asked(params, "binding"),
    // Type is a Story's attribute, so this narrows by what the Volumes carry rather than by
    // anything on the object itself — a Volume holding three Stories of two Types is found
    // under either of them, and once (ADR-0006).
    type: asked(params, "type"),
  };
  const narrowed = Boolean(filter.title || filter.publisher || filter.binding || filter.type);

  const [volumes, owned, elsewhere, bindings, types] = await Promise.all([
    searchCollection(filter),
    countCollection(),
    // Unnarrowed, deliberately: it is a short list beside the Collection, and a search that
    // emptied it would hide the one answer it exists to give — *you catalogued this and you
    // do not have it*.
    listCataloguedOutsideTheCollection(),
    listBindings(),
    listTypes(),
  ]);

  // What each row holds, in one statement rather than one per row: a hundred Volumes on a
  // shop's signal is not the place for a hundred round trips.
  const held = await listStoriesInVolumes(volumes.map((volume) => volume.id));

  const refused = asked(params, "refused");
  const catalogued = asked(params, "catalogued");
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
          is owned.
        </p>
      </header>

      {/* Sticky because the answer is read while scrolling and the question is what the
          owner keeps changing. `top-0` on a phone puts it under the thumb. */}
      <search className="sticky top-0 z-10 -mx-5 mt-6 border-b border-border bg-background/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <form action="/collection" className="grid gap-3 sm:grid-cols-2">
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

          <div className="grid gap-1.5">
            <Label htmlFor="search-binding" className="text-xs text-muted-foreground">
              Binding
            </Label>
            <BindingSelect
              id="search-binding"
              bindings={bindings}
              chosen={filter.binding}
              any="Any"
            />
          </div>

          {/* Type sits beside Binding because the two are asked the same way and answer
              different halves of the same doubt in a shop: *how is this one bound* and
              *what kind of thing is inside it*. */}
          <div className="grid gap-1.5">
            <Label htmlFor="search-type" className="text-xs text-muted-foreground">
              Type
            </Label>
            <Picker id="search-type" name="type" chosen={filter.type} any="Any">
              {types.map((type: Type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Picker>
          </div>

          <div className="flex items-end gap-2 sm:col-span-2">
            <Button type="submit" className="h-11 flex-1 sm:h-10 sm:flex-none sm:px-6">
              Search
            </Button>
            {narrowed ? (
              <Link
                href="/collection"
                className="inline-flex h-11 items-center px-2 sm:h-10 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
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
      {catalogued ? (
        <p role="status" className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
          {catalogued} is in the catalogue. Say it is in the house when you have it.
        </p>
      ) : null}
      {acquired ? (
        <p role="status" className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
          {acquired} is in the Collection.
        </p>
      ) : null}
      {released ? (
        <p role="status" className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
          {released} left the house. Its record is kept.
        </p>
      ) : null}

      <p className="mt-6 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {narrowed
          ? `${volumes.length} of ${owned} ${owned === 1 ? "Volume" : "Volumes"}`
          : `${owned} ${owned === 1 ? "Volume" : "Volumes"}`}
      </p>

      {volumes.length === 0 ? (
        <p className="mt-4 text-pretty text-sm text-muted-foreground">
          {narrowed
            ? "Nothing owned matches that. Which is the answer worth having in a shop — widen the search to be sure, then buy it."
            : "Nothing in the Collection yet. Catalogue the Volume in your hand below, then say it is in the house."}
        </p>
      ) : (
        <ul className="mt-2">
          {volumes.map((volume) => (
            <VolumeRow key={volume.id} volume={volume} stories={held[volume.id]} />
          ))}
        </ul>
      )}

      {elsewhere.length > 0 ? (
        <section className="mt-12">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Known, not in the house
          </h2>
          <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
            {elsewhere.length} {elsewhere.length === 1 ? "Volume" : "Volumes"} the library knows and
            the Collection does not claim: catalogued to be wanted, or had once and let go. Say one
            is in the house when it arrives.
          </p>

          {/* A dashed frame rather than the list's solid hairlines, because that is the
              difference the screen is about: these rows look like an outline of the shelf
              instead of the shelf. */}
          <ul className="mt-4 rounded-xl border border-dashed border-border px-4">
            {elsewhere.map((volume) => (
              <CataloguedRow key={volume.id} volume={volume} />
            ))}
          </ul>
        </section>
      ) : null}

      <details className="group mt-10 rounded-xl ring-1 ring-foreground/10">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden">
          Catalogue a Volume
          <span className="ml-2 text-muted-foreground group-open:hidden">
            — publisher, Binding, ISBN
          </span>
        </summary>

        {/* Two things this form deliberately does not ask for.
            No medium, and there is none to ask for: digital ownership is not modelled, so
            an owned ebook is not a thing this form could record even if it offered a box.
            And no price and no day, because those are facts about an object *coming home*
            and this form only says what the object is (ADR-0007) — they are asked for by
            the row above, at the moment they are true. */}
        <form action={catalogue} className="grid gap-4 border-t border-border p-4 sm:grid-cols-2">
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
            <Label htmlFor="catalogue-binding" className="text-xs text-muted-foreground">
              Binding
            </Label>
            <BindingSelect id="catalogue-binding" bindings={bindings} required />
          </div>

          <Field name="language" label="Language" defaultValue="it" required />
          <Field name="isbn" label="ISBN" placeholder="9788828765431" inputMode="numeric" />

          <div className="sm:col-span-2">
            <Button type="submit" className="h-11 w-full sm:h-10 sm:w-auto sm:px-6">
              Catalogue it
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              A language is a code — <code className="font-mono">it</code>,{" "}
              <code className="font-mono">en</code>, <code className="font-mono">ja</code>.
              Cataloguing says what the object is; it does not say you have it. Holding it? Say so
              from <em>Known, not in the house</em> above, with what you paid.
            </p>
          </div>
        </form>
      </details>
    </main>
  );
}

/**
 * A picker over a vocabulary that lives in the database — Binding, Type.
 *
 * A native select rather than a scripted one: on a phone it opens the platform picker, and
 * it submits with the form whether JavaScript ran or not. Both vocabularies are rows, so a
 * seventh Binding and a sixth Type appear here without this file being touched (ADR-0006),
 * which is exactly why the options are passed in rather than written down.
 */
function Picker({
  id,
  name,
  chosen,
  any,
  required,
  children,
}: {
  id: string;
  name: string;
  chosen?: string;
  /** The wording for "none in particular", where not choosing is allowed. */
  any?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={chosen ?? ""}
      required={required}
      className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 md:text-sm dark:bg-input/30"
    >
      {any ? <option value="">{any}</option> : null}
      {children}
    </select>
  );
}

/** The Binding picker, on the search and on the form. */
function BindingSelect({
  id,
  bindings,
  chosen,
  any,
  required,
}: {
  id: string;
  bindings: Binding[];
  chosen?: string;
  any?: string;
  required?: boolean;
}) {
  return (
    <Picker id={id} name="binding" chosen={chosen} any={any} required={required}>
      {bindings.map((binding) => (
        <option key={binding.id} value={binding.id}>
          {binding.name}
        </option>
      ))}
    </Picker>
  );
}

/**
 * One Volume: the title to recognise it by, the object's facts under it, and what it holds.
 *
 * The Stories are inside the disclosure rather than on the collapsed row on purpose. At
 * arm's length in a shop the question is *do I have this object* and the answer is the
 * title and the Binding; what is inside it is the second question, and it is asked by
 * opening the row.
 */
function VolumeRow({ volume, stories }: { volume: CollectionVolume; stories: CarriedStory[] }) {
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
          <Fact term="Came home" detail={volume.acquiredOn ?? "—"} />
          <Fact term="Language" detail={volume.language} />
          <Fact term="ISBN" detail={volume.isbn ?? "—"} mono />
        </dl>

        <p className="pb-3 text-xs leading-relaxed">
          <span className="text-muted-foreground">Holds </span>
          {stories.length === 0 ? (
            <span className="text-muted-foreground">
              nothing yet —{" "}
              <Link href={`/collection/${volume.id}`} className="underline underline-offset-4">
                say what is inside it
              </Link>
              .
            </span>
          ) : (
            <>
              {stories.map((story, index) => (
                <span key={story.id}>
                  {index > 0 ? <span className="text-muted-foreground"> · </span> : null}
                  <Link
                    href={`/stories/${story.id}`}
                    className="underline decoration-border underline-offset-4 hover:decoration-foreground"
                  >
                    {story.title}
                  </Link>
                </span>
              ))}
              <span className="text-muted-foreground">
                {" — "}
                <Link href={`/collection/${volume.id}`} className="underline underline-offset-4">
                  this object&apos;s page
                </Link>{" "}
                carries the rest, and the Edition note.
              </span>
            </>
          )}
        </p>

        <form action={release} className="pb-4">
          <input type="hidden" name="volumeId" value={volume.id} />
          <input type="hidden" name="title" value={volume.title} />
          <Button type="submit" variant="destructive" size="sm" className="h-11 sm:h-9">
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

/**
 * One Volume the library knows and the house does not hold.
 *
 * The same disclosure as a Collection row, and quieter: the title in muted ink, and inside
 * it the one form that changes the answer. The price and the day are asked for **here**,
 * because this is the moment they become true — the object came home, at a price, on a day
 * (ADR-0007) — and the ordinary case is one tap on *It is in the house* with both empty.
 */
function CataloguedRow({ volume }: { volume: CataloguedVolumeOutsideTheCollection }) {
  const under = [volume.publisher, volume.editionLine].filter(Boolean).join(" · ");

  return (
    <li className="border-t border-dashed border-border first:border-t-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 py-3 marker:hidden">
          <span className="min-w-0">
            <span className="block truncate font-medium text-muted-foreground">{volume.title}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {under}
              {volume.releasedOn ? ` · left the house on ${volume.releasedOn}` : null}
            </span>
          </span>
          <Badge variant="outline" className="shrink-0 border-dashed">
            {volume.binding.name}
          </Badge>
        </summary>

        <form action={acquire} className="grid gap-4 pb-4 sm:grid-cols-2">
          <input type="hidden" name="volumeId" value={volume.id} />
          <input type="hidden" name="title" value={volume.title} />
          {/* The prefix is the object's id, because these two fields are rendered once per
              row and a label has to point at its own input. */}
          <Field
            idPrefix={volume.id}
            name="pricePaid"
            label="Price paid"
            placeholder="6.50"
            inputMode="decimal"
          />
          <Field idPrefix={volume.id} name="acquiredOn" label="Came home" type="date" />

          <div className="sm:col-span-2">
            <Button type="submit" className="h-11 w-full sm:h-10 sm:w-auto sm:px-6">
              It is in the house
            </Button>
            <span className="mt-2 block text-xs text-muted-foreground sm:ml-3 sm:mt-0 sm:inline">
              Leave both empty where the receipt is gone.{" "}
              <Link
                href={`/collection/${volume.id}`}
                className="underline underline-offset-4 hover:text-foreground"
              >
                This object&apos;s page
              </Link>{" "}
              carries what it holds, and the Edition note.
            </span>
          </div>
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
  idPrefix = "catalogue",
  ...props
}: {
  name: string;
  label: string;
  className?: string;
  /** What makes the id unique where one field name appears in two forms on the page. */
  idPrefix?: string;
} & React.ComponentProps<typeof Input>) {
  const fieldId = `${idPrefix}-${name}`;

  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={fieldId} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={fieldId} name={name} className="h-10" {...props} />
    </div>
  );
}
