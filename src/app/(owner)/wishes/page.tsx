import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listOpenWishes,
  listVolumesToWishFor,
  type OpenWish,
  type VolumeToWishFor,
} from "@/core/queries/wish";
import { requireOwner } from "@/lib/auth/owner";
import { close, open } from "./actions";

// THE SHOPPING LIST. A Wish is an open intention to acquire a named Volume, and this
// screen is that intention read in the one place it matters: in a shop, one-handed, about
// to spend money. So the numbers that decide a purchase are on the row and not behind a
// tap — what it should cost, what it does cost, and where — and everything about the
// object that does not decide a purchase is under the disclosure.
//
// Three things this screen deliberately does not do, and each is the model rather than an
// omission:
//
// - **Nothing here closes a Wish except closing it.** There is no "bought it" button that
//   also touches the Collection, and no state to move a Wish through. A Wish ends by a
//   deliberate act and nothing else, so the only end on this page is `Close it`.
// - **There is no `Acquistato`.** A Wish that ended is off the list; the model cannot say
//   whether it ended because the book was bought, and does not pretend to.
// - **"Complete this series" is not here.** That is the collecting decision on a Series,
//   and its missing Volumes are a query rather than rows typed by hand.
//
// The list is grouped by priority rather than merely sorted by it, because that is the
// question the owner is actually asking — *what am I buying this month* — and three named
// groups answer it where a column of numbers would need reading. Everything else follows
// the Collection screen it sits beside: a `GET`-free page, `POST`s to server actions, and
// nothing running in the browser.
export const dynamic = "force-dynamic";

/** The three steps a shopping list is read in, and what each one is called on screen. */
const PRIORITIES = [
  { value: 1, name: "Next", hint: "buying this" },
  { value: 2, name: "Soon", hint: "when it turns up" },
  { value: 3, name: "Someday", hint: "not yet" },
] as const;

// A native select rather than a scripted one, twice on this screen: on a phone it opens
// the platform picker, and it submits with the form whether JavaScript ran or not. The
// look is shadcn's input, borrowed by hand because shadcn's own select is a scripted
// component and this screen runs nothing in the browser.
const PICKER =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 md:text-sm dark:bg-input/30";

type Asked = Record<string, string | string[] | undefined>;

/** One asked-for value, as a string, or nothing. */
function asked(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export default async function WishesPage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const params = await searchParams;
  const [wishes, volumes] = await Promise.all([listOpenWishes(), listVolumesToWishFor()]);

  const refused = asked(params, "refused");
  const opened = asked(params, "opened");
  const closed = asked(params, "closed");

  return (
    <main className="px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        <h1 className="font-heading text-2xl sm:text-3xl">Wishes</h1>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          What to buy, and what it should cost. A Wish names one Volume and ends only when you end
          it — nothing here disappears on its own.
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
      {opened ? (
        <p role="status" className="mt-6 rounded-lg bg-muted px-3 py-2 text-sm">
          The Wish is open, and on the list below.
        </p>
      ) : null}
      {closed ? (
        <p role="status" className="mt-6 rounded-lg bg-muted px-3 py-2 text-sm">
          {closed} is off the list. The Wish ended; nothing else changed.
        </p>
      ) : null}

      <p className="mt-8 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {wishes.length} open {wishes.length === 1 ? "Wish" : "Wishes"}
      </p>

      {wishes.length === 0 ? (
        <p className="mt-4 text-pretty text-sm text-muted-foreground">
          Nothing wanted right now. Open a Wish on a Volume below and it will be waiting here the
          next time you are in a shop.
        </p>
      ) : (
        PRIORITIES.map((priority) => {
          const group = wishes.filter((wish) => wish.priority === priority.value);
          if (group.length === 0) return null;

          return (
            <section key={priority.value} className="mt-8 first:mt-4">
              <h2 className="flex items-baseline gap-2 border-b border-border pb-1.5">
                <span className="font-heading text-lg">{priority.name}</span>
                <span className="text-xs text-muted-foreground">— {priority.hint}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {group.length}
                </span>
              </h2>
              <ul>
                {group.map((wish) => (
                  <WishRow key={wish.id} wish={wish} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      <details className="group mt-12 rounded-xl ring-1 ring-foreground/10">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden">
          Open a Wish
          <span className="ml-2 text-muted-foreground group-open:hidden">
            — a Volume, how soon, what it should cost
          </span>
        </summary>

        {volumes.length === 0 ? (
          <p className="border-t border-border p-4 text-pretty text-sm text-muted-foreground">
            A Wish names a Volume the library already knows.{" "}
            <Link href="/collection" className="underline underline-offset-4">
              Record the Volume
            </Link>{" "}
            first, then come back and want it.
          </p>
        ) : (
          <form action={open} className="grid gap-4 border-t border-border p-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="wish-volume" className="text-xs text-muted-foreground">
                Volume
              </Label>
              {/* Only Volumes the library already knows are offered, because creating one
                  is not this screen's to do: a title nobody recorded is an Inbox proposal
                  the owner approves (ADR-0005), never a row a Wish writes. */}
              <select id="wish-volume" name="volumeId" required defaultValue="" className={PICKER}>
                <option value="" disabled>
                  Pick a Volume
                </option>
                {volumes.map((volume) => (
                  <option key={volume.id} value={volume.id}>
                    {named(volume)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="wish-priority" className="text-xs text-muted-foreground">
                Priority
              </Label>
              <select id="wish-priority" name="priority" defaultValue="2" className={PICKER}>
                {PRIORITIES.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.name} — {priority.hint}
                  </option>
                ))}
              </select>
            </div>

            <Field name="shop" label="Shop" placeholder="Star Shop" />
            <Field
              name="targetPrice"
              label="Target price"
              placeholder="15.00"
              inputMode="decimal"
            />
            <Field name="priceFound" label="Price found" placeholder="12.90" inputMode="decimal" />

            <div className="sm:col-span-2">
              <Button type="submit" className="h-11 w-full sm:h-10 sm:w-auto sm:px-6">
                Open it
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                A price is written with a dot — <code className="font-mono">12.90</code>. Leave both
                empty while you are only watching for it.
              </p>
            </div>
          </form>
        )}
      </details>
    </main>
  );
}

/**
 * A Volume in the picker: enough of the object to tell two editions of one story apart.
 *
 * **The marked ones are the ones already in the house**, which is the inversion ADR-0007
 * forced: an object the owner does not have is the ordinary thing to want, and marking it
 * `(released)` claimed they had once had it — true of the ones they let go, and a lie about
 * everything catalogued to be wanted. Wanting something owned is the case worth a word.
 */
function named(volume: VolumeToWishFor): string {
  const parts = [volume.title, volume.editionLine, volume.publisher, volume.binding].filter(
    Boolean
  );
  const name = parts.join(" · ");
  return volume.inCollection ? `${name} (in the house)` : name;
}

/**
 * One Wish: the object to recognise, the money to decide by, and — a tap away — the one
 * act that ends it.
 */
function WishRow({ wish }: { wish: OpenWish }) {
  const under = [wish.volume.publisher, wish.volume.editionLine].filter(Boolean).join(" · ");

  return (
    <li className="border-b border-border last:border-b-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 py-3 marker:hidden">
          <span className="min-w-0">
            <span className="block truncate font-medium">{wish.volume.title}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{under}</span>
            <Money wish={wish} />
          </span>
          <Badge variant="outline" className="shrink-0">
            {wish.volume.binding.name}
          </Badge>
        </summary>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 pb-4 text-xs sm:grid-cols-4">
          <Fact term="Target" detail={wish.targetPrice ? `€ ${wish.targetPrice}` : "—"} />
          <Fact term="Found" detail={wish.priceFound ? `€ ${wish.priceFound}` : "—"} />
          <Fact term="Shop" detail={wish.shop ?? "—"} />
          <Fact term="Wanted since" detail={wish.openedOn} />
        </dl>

        {/* A fact about the shelf, not a state of the Wish. Owning the object does not end
            the intention to buy it — only the owner does — so the overlap is shown rather
            than resolved by the app. */}
        {wish.inCollection ? (
          <p className="pb-4 text-xs text-muted-foreground">
            The Collection already claims this Volume. The Wish stays open until you close it.
          </p>
        ) : null}

        <form action={close} className="pb-4">
          <input type="hidden" name="wishId" value={wish.id} />
          <input type="hidden" name="title" value={wish.volume.title} />
          <Button type="submit" variant="secondary" size="sm" className="h-11 sm:h-9">
            Close it
          </Button>
          <span className="ml-3 text-xs text-muted-foreground">
            Bought it, or stopped wanting it. Either way the Wish ends here and only here.
          </span>
        </form>
      </details>
    </li>
  );
}

/**
 * The two numbers, on the row rather than behind a tap, because they are what the owner
 * came to this screen to compare. Silent when neither is known: a Wish is a Wish before a
 * price is.
 */
function Money({ wish }: { wish: OpenWish }) {
  if (!wish.priceFound && !wish.targetPrice) return null;

  return (
    <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
      {wish.priceFound ? (
        <span className="font-mono">
          € {wish.priceFound}
          {wish.shop ? <span className="text-muted-foreground"> at {wish.shop}</span> : null}
        </span>
      ) : (
        <span className="text-muted-foreground">no price found yet</span>
      )}
      {wish.targetPrice ? (
        <span className="font-mono text-muted-foreground">target € {wish.targetPrice}</span>
      ) : null}
      {wish.withinTarget === false ? (
        <span className="text-muted-foreground">— over target</span>
      ) : null}
      {wish.withinTarget === true ? <span className="font-medium">— at your price</span> : null}
    </span>
  );
}

function Fact({ term, detail }: { term: string; detail: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{term}</dt>
      <dd>{detail}</dd>
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
      <Label htmlFor={`wish-${name}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={`wish-${name}`} name={name} className="h-10" {...props} />
    </div>
  );
}
