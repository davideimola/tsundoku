import Link from "next/link";
import { Cover } from "@/components/cover";
import { Drawer, OpensDrawer } from "@/components/drawer";
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
import { tint } from "@/lib/tint";
import { close, open } from "./actions";
import { OPENING_A_WISH, PRIORITIES, theShoppingList, wishDetail } from "./shopping";

// THE SHOPPING LIST. A Wish is an open intention to acquire a named Volume, and this
// screen is that intention read in the one place it matters: **standing in a shop, on the
// shop's signal, about to spend money.** So the phone is the target and the desk is the
// same screen with more air.
//
// Three things this screen deliberately does not do, and each is the model rather than an
// omission:
//
// - **Nothing here closes a Wish except closing it.** There is no "bought it" button that
//   also touches the Collection, and no state to move a Wish through. A Wish ends by a
//   deliberate act and nothing else, so the only end on this page is `Close it`.
// - **There is no `Acquistato`.** A Wish that ended is off the list; the model cannot say
//   whether it ended because the book was bought, and does not pretend to.
// - **"Complete this series" is not here, and cannot be typed in.** A Wish names one
//   catalogued Volume — the picker offers objects and nothing else — because completing a
//   Series is the collecting decision on the Series and its missing Volumes are a query
//   rather than rows somebody keeps by hand.
//
// **In the shell now** (#31), which changed three things and no more.
//
//   1. **The object is looked at rather than read.** Every Wish carries the tile the walls
//      are laid out as, in the Series' own tint and wearing the jacket where a lookup found
//      one — because what the owner is holding in a shop is a book, and a row of text is the
//      format the spreadsheet already had. It leads to the object's own page.
//   2. **The width is spent on the list rather than on a margin.** The Wishes stand two and
//      three abreast at a desk and one under the other on a phone, so a shopping list of a
//      dozen is one screen instead of a scroll — and the numbers that decide a purchase are
//      on the card rather than behind the disclosure they used to be folded into. A tap in a
//      shop to find out what a book should cost is a tap too many.
//   3. **Opening one is a panel off the hero** (`@/components/drawer`), the shape the
//      Collection wall and the Series ledger already have: the open state is the URL, so it
//      costs no script, `?panel=open` is a bookmark for *want something*, and the back
//      button closes it.
//
// The banding is the screen's and it is `./shopping`, which the Pile's picker reads
// too. Everything else is the house style: plain forms, `POST`s to server actions, and
// nothing running in the browser.
export const dynamic = "force-dynamic";

// A native select rather than a scripted one, twice in the panel: on a phone it opens the
// platform picker, and it submits with the form whether JavaScript ran or not. The look is
// shadcn's input, borrowed by hand because shadcn's own select is a scripted component and
// this screen runs nothing in the browser.
const PICKER =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 md:text-sm dark:bg-input/30";

// The one panel this screen has, read against the act it belongs to rather than trusted:
// `?panel=banana` opens nothing, which is the honesty every filter on every wall is held to.
// The name is `./shopping`'s: the Server Function behind the form has to send a refusal back
// into this same panel, so one spelling serves both.
//
// This screen narrows nothing, so a panel's address carries the panel and nothing else — and
// deliberately not the answer to the last write, which is about the press that produced it.
const OPENS_AT = `/wishes?panel=${OPENING_A_WISH}`;
const CLOSES_TO = "/wishes";

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
  const panel = asked(params, "panel") === OPENING_A_WISH ? OPENING_A_WISH : undefined;
  const bands = theShoppingList(wishes);

  return (
    <main className="px-5 pb-16 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 pt-8 sm:pt-12">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl sm:text-3xl">Wishes</h1>
          <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
            What to buy, and what it should cost. A Wish names one Volume and ends only when you end
            it — nothing here disappears on its own.
          </p>
        </div>

        <OpensDrawer href={OPENS_AT} emphasis="loud">
          Open a Wish
        </OpensDrawer>
      </header>

      {/* On the page only where the panel is not standing over it: a refused Wish comes back
          with its five fields open, and the sentence is printed in there beside them. */}
      {refused && !panel ? (
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

      <p className="mt-8 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
        {wishes.length} open {wishes.length === 1 ? "Wish" : "Wishes"}
      </p>

      {wishes.length === 0 ? (
        <p className="mt-4 max-w-prose text-pretty text-sm text-muted-foreground">
          Nothing wanted right now. <em>Open a Wish</em> is at the top of the screen: name a Volume
          the library knows, say how soon, and it will be waiting here the next time you are in a
          shop.
        </p>
      ) : (
        <div className="mt-4 space-y-10">
          {bands.map((band) => (
            <section key={band.priority} aria-labelledby={`band-${band.priority}`}>
              <h2
                id={`band-${band.priority}`}
                className="flex items-baseline gap-3 border-b border-border pb-1.5"
              >
                <span className="font-heading text-lg">{band.name}</span>
                {band.hint ? (
                  <span className="text-xs text-muted-foreground">— {band.hint}</span>
                ) : null}
                <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                  {band.wishes.length}
                </span>
              </h2>

              {/* Two and three abreast at a desk, one under the other on a phone: a dozen
                  Wishes are one screen either way, and the card is the same object at both
                  widths rather than a second layout to keep in step. */}
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {band.wishes.map((wish) => (
                  <WishCard key={wish.id} wish={wish} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {panel === OPENING_A_WISH ? (
        <Drawer
          title="Open a Wish"
          description="One Volume the library already knows, and how soon you want it. Completing a Series is not a Wish: that is the collecting decision on the Series, and what it is missing is a query."
          refused={refused}
          closesTo={CLOSES_TO}
        >
          {volumes.length === 0 ? (
            <p className="text-pretty text-sm text-muted-foreground">
              A Wish names a Volume the library already knows.{" "}
              <Link href="/collection" className="underline underline-offset-4">
                Catalogue the Volume
              </Link>{" "}
              first, then come back and want it.
            </p>
          ) : (
            <form action={open} className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="wish-volume" className="text-xs text-muted-foreground">
                  Volume
                </Label>
                {/* Only Volumes the library already knows are offered, because creating one
                    is not this screen's to do: a title nobody recorded is an Inbox proposal
                    the owner approves (ADR-0005), never a row a Wish writes. */}
                <select
                  id="wish-volume"
                  name="volumeId"
                  required
                  defaultValue=""
                  className={PICKER}
                >
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
              <Field
                name="priceFound"
                label="Price found"
                placeholder="12.90"
                inputMode="decimal"
              />

              <Button type="submit" className="h-11 w-full sm:h-10">
                Open it
              </Button>
              <p className="max-w-prose text-xs text-muted-foreground">
                A price takes a dot or a comma — <code className="font-mono">12,90</code>. Leave
                both empty while you are only watching for it.
              </p>
            </form>
          )}
        </Drawer>
      ) : null}
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
 * One Wish: the object to recognise it by, the money to decide by, and the one act that
 * ends it.
 *
 * **Nothing is folded away.** This card used to be a disclosure with the four numbers
 * behind it, and the tap that opened it was a tap taken standing in a shop with a book in
 * the other hand. Everything that decides a purchase is on it.
 */
function WishCard({ wish }: { wish: OpenWish }) {
  const under = [wish.volume.publisher, wish.volume.editionLine].filter(Boolean).join(" · ");

  return (
    <li className="flex gap-4 rounded-xl p-4 ring-1 ring-foreground/10">
      {/* The object, faced outwards — the same tile as on the walls, in the same colour and
          the same shape, so a Wish is recognised by sight rather than read. It leads to the
          object's own page, which is where the ISBN and the edition live. */}
      <div className="w-16 shrink-0 sm:w-20">
        <Cover
          href={`/collection/${wish.volume.id}`}
          title={wish.volume.title}
          tint={tint(wish.volume.seriesId)}
          detail={wishDetail(wish)}
          foot={<Position of={wish.volume.seriesNumber} />}
          image={wish.volume.cover}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="min-w-0 font-heading text-balance">{wish.volume.title}</h3>
          <Badge variant="outline" className="shrink-0">
            {wish.volume.binding.name}
          </Badge>
        </div>
        {under ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{under}</p> : null}

        <Money wish={wish} />

        <p className="mt-1.5 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
          wanted since {wish.openedOn}
        </p>

        {/* A fact about the shelf, not a state of the Wish. Owning the object does not end
            the intention to buy it — only the owner does — so the overlap is shown rather
            than resolved by the app. */}
        {wish.inCollection ? (
          <p className="mt-3 text-pretty text-xs text-muted-foreground">
            The Collection already claims this Volume. The Wish stays open until you close it.
          </p>
        ) : null}

        {/* **A press that asks for nothing is a plain form and not a panel**, and this one
            asks for nothing: closing a Wish takes no field, and a drawer in front of it
            would be a door in front of a door. */}
        <form action={close} className="mt-3">
          <input type="hidden" name="wishId" value={wish.id} />
          <input type="hidden" name="title" value={wish.volume.title} />
          <Button type="submit" variant="secondary" size="sm" className="h-11 sm:h-9">
            Close it
          </Button>
          <span className="ml-3 text-xs text-muted-foreground">
            Bought it, or stopped wanting it.
          </span>
        </form>
      </div>
    </li>
  );
}

/**
 * Where the object stands in its line, at the foot of the tile — **and standing in no line
 * reads as an absence rather than as a nought.**
 *
 * The same posture the Story wall's score takes to a Story nobody judged: an em dash with the
 * reason said out loud to anything not looking at the page. Most of what a Wish names stands
 * in no line at all, because a position of a Series is filled by what is on the shelf.
 */
function Position({ of }: { of: number | null }) {
  if (of === null) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">Stands in no line</span>
      </>
    );
  }

  return <>{of}</>;
}

/**
 * **The whole of the money, in one line**: what it costs, where, what it should cost, and
 * whether that is a purchase.
 *
 * One line rather than the two registers this card had while the numbers were folded behind
 * a disclosure — a glanceable price *and* a four-cell table under it printed *€ 95.00* twice
 * and three em dashes for the fields nobody filled in. What a Wish carries and what it does
 * not are the same fact said once, and the shape follows the rest of the application: a
 * record that carries nothing reads as an absence in words rather than as a row of dashes.
 *
 * It is never silent. A Wish with no price at all is the ordinary case — wanting comes
 * before pricing — and saying so is what stops the card from looking like one that failed to
 * render its numbers.
 */
function Money({ wish }: { wish: OpenWish }) {
  return (
    <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
      {wish.priceFound ? (
        <span className="font-mono">€ {wish.priceFound}</span>
      ) : (
        <span className="text-muted-foreground">
          {wish.targetPrice ? "no price found yet" : "no price yet"}
        </span>
      )}
      {/* Where that price was — or where the owner means to look, when they wrote a shop
          down before a number. */}
      {wish.shop ? <span className="text-muted-foreground">at {wish.shop}</span> : null}
      {wish.targetPrice ? (
        <span className="font-mono text-muted-foreground">target € {wish.targetPrice}</span>
      ) : null}
      {wish.withinTarget === false ? (
        <span className="text-muted-foreground">— over target</span>
      ) : null}
      {wish.withinTarget === true ? <span className="font-medium">— at your price</span> : null}
    </p>
  );
}

function Field({
  name,
  label,
  ...props
}: {
  name: string;
  label: string;
} & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`wish-${name}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={`wish-${name}`} name={name} className="h-11 sm:h-10" {...props} />
    </div>
  );
}
