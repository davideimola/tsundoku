"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
      {/* Keyed on the path so that following a link out of *More* leaves it shut: a
          client-side navigation keeps the DOM, and a `<details>` nobody remounts would
          still be hanging open over the next screen. */}
      <Phone key={pathname} here={here} />

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
 * The phone. Four destinations and a fifth tab, fixed to the bottom of the window and
 * inside the reach of one thumb.
 *
 * The four are the ones worth opening away from the desk — which destination carries which
 * is argued for in `./navigation` — and the rest are one tap behind the fifth, which is a
 * plain `<details>`: it opens with nothing running in the browser, which is what a screen
 * used on a shop's signal needs (ADR-0010), and it costs no state, no listener and no
 * dependency.
 *
 * No icons, because #19 bought none and a glyph invented for *Wishes* would have to be
 * learned. What marks the destination the owner is on is a rule above its name — the same
 * hairline the rest of the application is drawn with, at full ink.
 */
function Phone({ here }: { here: string | undefined }) {
  // The one thing the fifth tab needs to know: whether the owner is on a screen it holds.
  // It answers both what the tab is called and whether it is marked, so it is looked up
  // once rather than asked twice in two ways.
  const beyond = BEHIND_MORE.flatMap((section) => section.destinations).find(
    ({ href }) => href === here
  );

  // *More* while the owner is on one of the four, and the **name of the screen they are
  // on** while they are behind it: the criterion is that the section is legible without
  // reading the URL, and a bar that said *More* on Stories would be telling them where
  // they are not. Opening it is the same tap either way.
  const fifth = beyond?.label ?? "More";

  return (
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
          <details className="relative">
            <summary
              className={cn(
                "flex h-14 cursor-pointer list-none flex-col items-center justify-center gap-1.5 px-1 text-center text-eyebrow [&::-webkit-details-marker]:hidden",
                beyond ? "text-foreground" : "text-muted-foreground",
                FOCUS
              )}
            >
              <Rule on={beyond !== undefined} />
              {fifth}
            </summary>

            {/* Opening upwards from the right edge, which is the tap that opened it and
                the one place on a phone where there is room above. Anchored by `right`
                alone: the panel is wider than the fifth of the bar it hangs off, so
                giving it a left edge as well would over-constrain it and send it off the
                side of the window. */}
            <div className="absolute bottom-full right-1 mb-2 w-44 rounded-lg border border-border bg-popover p-2 shadow-lg">
              {BEHIND_MORE.map((section) => (
                <div key={section.title} className="mb-2 last:mb-0">
                  <h2 className="px-2 py-1 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
                    {section.title}
                  </h2>
                  <ul>
                    {section.destinations.map((destination) => (
                      <li key={destination.href}>
                        <Row destination={destination} here={here} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <SignOut className="border-t border-border pt-1" />
            </div>
          </details>
        </li>
      </ul>
    </nav>
  );
}

/**
 * A destination as a row, which is the shape it takes in both places that list them: the
 * sidebar at the desk, and the panel the phone's fifth tab opens. One component because
 * they are one thing — the same word, the same mark of being where the owner is, and the
 * same `aria-current` — rather than two that happen to look alike today.
 *
 * The quiet accent is the shadcn token rather than the sidebar's own, because the two are
 * aliases of the same `--paper-quiet` (`src/app/globals.css`) and spending the general one
 * is what lets a single component stand in both surfaces.
 */
function Row({ destination, here }: { destination: Destination; here: string | undefined }) {
  const current = here === destination.href;

  return (
    <Link
      href={destination.href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "block rounded-md px-2 py-1.5 text-sm transition-colors",
        current
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        FOCUS
      )}
    >
      {destination.label}
    </Link>
  );
}

/**
 * A destination as one of the phone's five tabs: a rule, then the name, centred in its
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
        "flex h-14 flex-col items-center justify-center gap-1.5 px-1 text-center text-eyebrow",
        current ? "text-foreground" : "text-muted-foreground",
        FOCUS
      )}
    >
      <Rule on={current} />
      {destination.label}
    </Link>
  );
}

/** The mark above a name in the bottom bar: a hairline, at full ink where the owner is. */
function Rule({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("h-0.5 w-5 rounded-full", on ? "bg-foreground" : "bg-transparent")}
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
function SignOut({ className }: { className?: string }) {
  return (
    <form action={signOutOwner} className={className}>
      <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
        Sign out
      </Button>
    </form>
  );
}
