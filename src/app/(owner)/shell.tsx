"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { GlyphFor, MoreGlyph } from "@/components/glyphs";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { signOutOwner } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import { DoorAtTheDesk, DoorOnThePhone } from "./door";
import { FinderPalette, FinderTrigger } from "./finder";
import {
  BEHIND_MORE,
  currentDestination,
  type Destination,
  NAVIGATION,
  ON_THE_BAR,
} from "./navigation";

// THE SHELL. Every screen in the group is rendered inside it, which is the whole of what
// this file is for: before it there was no `<nav>` anywhere in the project, the nine
// screens were linked from the home page alone, and every one of them was a dead end left
// to the browser's back button.
//
// **Two shapes of the same map** (`./navigation`), and no third one: a persistent sidebar
// at the desk, and a bottom bar on a phone carrying the four destinations worth opening
// away from it. The map is shared so the two cannot disagree about what exists; the
// *shapes* differ because the postures do — a mouse at a desk reaches anywhere, a thumb on
// a phone reaches the bottom of the screen and little else.
//
// The two swap at `lg` (1024px) and not sooner: the sidebar costs 15rem, and a tablet in
// portrait would rather spend that on the library and reach the bar with a thumb it
// already has on the glass.
//
// **And one glyph beside the mark**, at both widths, which is what makes the finder
// reachable from every screen (#25). It is in the chrome rather than on a screen for exactly
// the reason the navigation is: a search that depended on which page the owner happened to be
// on would send them home first. The glyph opens a palette over the whole window — one of
// them, rendered here beside the two chromes rather than inside either, so the shortcut is a
// single listener and the answer a single piece of state. `./finder` is both halves;
// `./navigation` says why `/find` is a screen in this group and not a line in the map.
//
// It is a client component, which ADR-0010 allows and which nothing here abuses. What it
// wants from the browser is `usePathname()`, so that the navigation can say where the owner
// is without them reading the URL, and the field's suggestions, arrow keys and shortcut —
// none of which anything depends on: the field is a plain `GET` form to `/find`, the one
// other form in here is a plain POST to a Server Function, and both work with nothing
// running. It renders on the server like everything else, so the navigation's answer is
// already in the HTML.

/** The house's focus ring, the same one the links inside the screens carry. */
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Shell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const here = currentDestination(pathname);

  // Whether the finder is open, which is the only thing this shell remembers. It is here
  // rather than in `./finder` because the two triggers are in the two chromes and the
  // palette is beside them: one fact, three places, and no way for them to disagree.
  const [finding, setFinding] = useState(false);

  // Whether *More* is open, which the shell does not remember either: it is one search
  // param on the address the owner is already at (`./shell`'s own paragraph above, and
  // `src/components/drawer.tsx` for the argument in full). A tap on the scrim is a link
  // home to this screen, and the back gesture shuts it because shutting it is what going
  // back means.
  const menu = useMenu();

  return (
    <>
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Desk here={here} onFind={() => setFinding(true)} />
        <div className="min-w-0">
          <PhoneChrome onFind={() => setFinding(true)} />
          {/* Room for the bar the phone floats over its own content. */}
          <div className="pb-24 lg:pb-0">{children}</div>
        </div>
      </div>
      <Phone here={here} menu={menu} />

      <FinderPalette open={finding} onOpenChange={setFinding} />
    </>
  );
}

/**
 * The desk. A sidebar that is always there, grouped into the three questions and labelled
 * with them, because at this width there is room to name a group and the owner meets all
 * nine destinations at once.
 */
function Desk({ here, onFind }: { here: string | undefined; onFind: () => void }) {
  return (
    <nav
      aria-label="Sections"
      className="sticky top-0 hidden h-dvh flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 lg:flex"
    >
      {/* The name and the finder on one line, which is the whole of the chrome above the
          map: the way to the front of the application, and the way to a record. */}
      <div className="flex items-center gap-1">
        <Link
          href="/"
          className={cn(
            "flex min-w-0 items-center gap-2.5 rounded-md px-2 font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground",
            FOCUS
          )}
        >
          <Mark className="size-5 shrink-0 text-foreground" />
          tsundoku
        </Link>

        <FinderTrigger onOpen={onFind} className="ml-auto" />
      </div>

      {/* The act, before the questions. It is the one filled thing in the chrome, and it
          sits above the map rather than in it because it is not a destination — see
          `./navigation`'s `THE_DOOR` for the argument and `./door` for the anatomy. */}
      <DoorAtTheDesk className="mt-6" />

      <div className="mt-7 flex-1 space-y-7 overflow-y-auto">
        {NAVIGATION.map((section) => (
          <div key={section.title}>
            <h2 className="px-2 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
              {section.title}
            </h2>
            <ul className="mt-1.5">
              {section.destinations.map((destination) => (
                <li key={destination.href}>
                  <Row destination={destination} here={here} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <SignOut className="mt-6 border-t border-sidebar-border pt-3" />
    </nav>
  );
}

/**
 * The phone's chrome above the fold: the mark, the application's name linking home, and the
 * finder.
 *
 * It is still a strip and not a bar of controls. The navigation on a phone lives at the
 * bottom where a thumb is, and what this carries is the three affordances that have to be at
 * the top of a page rather than the bottom of it — the way back to the front of the
 * application, which is also the mark; the way into the finder, which opens a field that has
 * to be above the keyboard rather than under it; and the door, which opens a field to type a
 * title into or a camera to point at a barcode, both of which are two-handed and both of
 * which are above the fold. The door stays out of the bar below for the reason `./navigation`
 * gives: that bar is four *destinations*, and a sixth slot would take every tab under the
 * width its one word already barely fits in.
 *
 * The glyph and no key beside it: there is no `⌘` to press on a phone, and a hint about one
 * would be chrome that is only ever wrong here.
 */
function PhoneChrome({ onFind }: { onFind: () => void }) {
  return (
    <div className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-border bg-background px-5 sm:gap-3 sm:px-8 lg:hidden">
      <Link
        href="/"
        className={cn(
          "flex shrink-0 items-center gap-2.5 font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground",
          FOCUS
        )}
      >
        <Mark className="size-5 shrink-0 text-foreground" />
        tsundoku
      </Link>

      <FinderTrigger onOpen={onFind} className="ml-auto" />
      <DoorOnThePhone />
    </div>
  );
}

/**
 * WHERE *MORE* KEEPS ITS ONE BIT OF STATE: the address, and not the browser.
 *
 * It was a `<details>` for one release, on the argument that it opens with nothing running
 * — which is true, and was not enough. A `<details>` cannot be shut by tapping away from
 * it, which is how every panel on a phone is shut; it takes no scrim, so the screen behind
 * it stays as loud as the panel; and the back gesture, which the owner's thumb is already
 * on, does nothing to it.
 *
 * A search param has all three and keeps what the `<details>` was bought for: the panel is
 * server-rendered when `?menu=open` is on the address, every way out of it is a `<Link>`
 * back to the address without it, and nothing has to be running for any of that. It is the
 * drawer's design (`src/components/drawer.tsx`, ADR-0010) spent on the navigation, and the
 * one difference is that this panel is never linked to on purpose: it is a menu, so the
 * only thing that opens it is the tab.
 *
 * Every other param on the address is carried through untouched — the Collection's filters
 * are still on it, and a menu that dropped them would be a menu that undoes a search.
 */
function useMenu(): { open: boolean; opens: string; shuts: string } {
  const pathname = usePathname();
  const params = useSearchParams();

  const at = (open: boolean) => {
    const next = new URLSearchParams(params.toString());
    if (open) next.set("menu", "open");
    else next.delete("menu");

    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  return { open: params.get("menu") === "open", opens: at(true), shuts: at(false) };
}

/**
 * The phone. Four destinations and a fifth tab, fixed to the bottom of the window and
 * inside the reach of one thumb.
 *
 * The four are the ones worth opening away from the desk — which destination carries which
 * is argued for in `./navigation` — and the rest are one tap behind the fifth, which opens
 * the sheet below.
 *
 * **Each tab is drawn as well as named** (`src/components/glyphs.tsx`). That retires the
 * stance that stood here — *"no icons, because #19 bought none and a glyph invented for
 * Wishes would have to be learned"* — and it retires it on the evidence of using the thing:
 * five words at eleven pixels are five acts of reading, the tab was a word and a hairline,
 * and *Collection* did not fit its fifth of the bar on one line. A glyph is learned once
 * and then recognised, and the word stays under it so that the first time is not a guess.
 *
 * **The fifth tab is called *More* on every screen.** It renamed itself to whatever screen
 * the owner was on — *Stories*, *Series* — on the argument that the bar should say where
 * they are. What that cost is the thing a bar is for: a control in a fixed place with a
 * fixed name, which the thumb finds without the eye. Where they are is now said by the tab
 * being marked, the same way the other four say it, and the name holds still.
 *
 * Sixty-four pixels tall and no hairline above the glyph: the rule that marked the current
 * destination has moved to the top edge of its cell, where it costs no room between the
 * glyph and the word.
 */
function Phone({
  here,
  menu,
}: {
  here: string | undefined;
  menu: { open: boolean; opens: string; shuts: string };
}) {
  // Whether the owner is on a screen the fifth tab holds. It is what marks the tab, and
  // it is looked up once rather than asked twice in two ways.
  const beyond = BEHIND_MORE.flatMap((section) => section.destinations).some(
    ({ href }) => href === here
  );

  return (
    <>
      {menu.open && <Sheet here={here} shuts={menu.shuts} />}

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="flex items-stretch">
          {ON_THE_BAR.map((destination) => (
            <li key={destination.href} className="min-w-0 flex-1">
              <Tab destination={destination} here={here} />
            </li>
          ))}

          <li className="min-w-0 flex-1">
            <Link
              href={menu.open ? menu.shuts : menu.opens}
              aria-expanded={menu.open}
              className={cn(
                "relative flex h-16 flex-col items-center justify-center gap-1 px-1 text-center text-eyebrow",
                beyond || menu.open ? "text-foreground" : "text-muted-foreground",
                FOCUS
              )}
            >
              <Rule on={beyond || menu.open} />
              <MoreGlyph className="size-[22px]" />
              <span className={cn("truncate", (beyond || menu.open) && "font-medium")}>More</span>
            </Link>
          </li>
        </ul>
      </nav>
    </>
  );
}

/**
 * What the fifth tab opens: **a sheet up from the edge the tap came from**, over a scrim
 * that shuts it.
 *
 * It replaces a popover eleven rems wide that hung off the right of the bar with rows a
 * third of a thumb tall. The width is the window's because there is no reason for it not to
 * be, and what the room buys is rows of forty-eight pixels carrying the destination's own
 * glyph — the same mark the tab beside it carries, so the map is one drawing at two sizes.
 *
 * The sections are named in here and not on the bar, which is the division the two shapes
 * have always had: the bar is four things a thumb reaches for, the sheet is the map, and
 * the map is three questions.
 */
function Sheet({ here, shuts }: { here: string | undefined; shuts: string }) {
  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      {/* The ground behind, dimmed — and it is a link, because tapping away from a panel is
          how a panel is shut everywhere else. No accessible name: the tab that opened it is
          the control a screen reader should find, and it is still on the bar underneath. */}
      <Link
        href={shuts}
        aria-hidden
        tabIndex={-1}
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
      />

      <nav
        aria-label="More sections"
        className={cn(
          "absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-background px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 ring-1 ring-foreground/10",
          "motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-200"
        )}
      >
        {/* The grip a sheet is dragged by everywhere else. It drags nothing here — the
            sheet has one bit of state and the scrim above it is the way out — and it is
            drawn because it is what says *this came up from the bottom and goes back
            down*. */}
        <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />

        {BEHIND_MORE.map((section) => (
          <div key={section.title} className="mb-3 last:mb-0">
            <h2 className="px-3 pb-1 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
              {section.title}
            </h2>
            <ul>
              {section.destinations.map((destination) => (
                <li key={destination.href}>
                  <Row destination={destination} here={here} roomy />
                </li>
              ))}
            </ul>
          </div>
        ))}

        <SignOut className="mt-2 border-t border-border pt-2" roomy />
      </nav>
    </div>
  );
}

/**
 * A destination as a row, which is the shape it takes in both places that list them: the
 * sidebar at the desk, and the sheet the phone's fifth tab opens. One component because
 * they are one thing — the same mark, the same word, the same sign of being where the owner
 * is, and the same `aria-current` — rather than two that happen to look alike today.
 *
 * `roomy` is the one thing the two postures disagree about, and it is a tap target rather
 * than a taste: a pointer hits a thirty-pixel row and a thumb does not.
 *
 * The quiet accent is the shadcn token rather than the sidebar's own, because the two are
 * aliases of the same `--paper-quiet` (`src/app/globals.css`) and spending the general one
 * is what lets a single component stand in both surfaces.
 */
function Row({
  destination,
  here,
  roomy,
}: {
  destination: Destination;
  here: string | undefined;
  roomy?: boolean;
}) {
  const current = here === destination.href;

  return (
    <Link
      href={destination.href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
        roomy ? "h-12 gap-3 px-3" : "py-1.5",
        current
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        FOCUS
      )}
    >
      <GlyphFor
        href={destination.href}
        className={cn("shrink-0", roomy ? "size-5" : "size-4", !current && "text-muted-foreground")}
      />
      {destination.label}
    </Link>
  );
}

/**
 * A destination as one of the phone's five tabs: the mark, then the name, centred in its
 * fifth of the bar and tall enough to be hit without aiming. A different anatomy from a
 * row rather than a variant of one, which is why it is its own component.
 */
function Tab({ destination, here }: { destination: Destination; here: string | undefined }) {
  const current = here === destination.href;

  return (
    <Link
      href={destination.href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "relative flex h-16 flex-col items-center justify-center gap-1 px-1 text-center text-eyebrow",
        current ? "text-foreground" : "text-muted-foreground",
        FOCUS
      )}
    >
      <Rule on={current} />
      <GlyphFor href={destination.href} className="size-[22px]" />
      <span className={cn("truncate", current && "font-medium")}>{destination.label}</span>
    </Link>
  );
}

/**
 * The mark of the tab the owner is on: the house's hairline, at full ink, ruled across the
 * top edge of the cell.
 *
 * It used to sit above the word inside the tab, which is where the room for a glyph now is.
 * Moving it to the edge costs nothing vertically and says the same thing more plainly — the
 * bar is drawn with one rule along its top, and the current tab is the length of it that is
 * inked.
 */
function Rule({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute inset-x-2 top-0 h-0.5 rounded-full",
        on ? "bg-foreground" : "bg-transparent"
      )}
    />
  );
}

/**
 * The way out, still deliberately quiet and still at the foot of things: with a 90-day
 * session a stray tap on a phone costs a round trip to Google. It has moved from the end
 * of every page into the chrome — the foot of the sidebar, and the foot of *More* — which
 * is reachable from every screen instead of only from the bottom of one, and which on the
 * phone is now behind a tap it was not behind before.
 *
 * It earns its place because ending the session is the only way out of a cookie issued to
 * an address that is no longer the owner's.
 */
function SignOut({ className, roomy }: { className?: string; roomy?: boolean }) {
  return (
    <form action={signOutOwner} className={className}>
      <Button
        type="submit"
        variant="ghost"
        size={roomy ? "default" : "sm"}
        className={cn("text-muted-foreground", roomy && "h-12 w-full justify-start px-3")}
      >
        Sign out
      </Button>
    </form>
  );
}
