// **Paper and ink as sRGB, for the surfaces this application's stylesheet cannot reach.**
//
// There are three of them and they have one thing in common: none is inside the document,
// so none can resolve a `var()`. A browser tab draws the favicon in its own chrome; an
// operating system paints a home-screen tile and a splash screen from a manifest it read
// before the page existed; the phone's status bar takes a `theme-color` from a `<meta>`.
// Ask any of them for `--paper` and they get nothing.
//
// So this file names four colours, which makes it the fifth file in `src/` allowed to
// (`src/app/palette.test.ts`) — and it is allowed for the same reason `lib/tint.ts` is:
// **it is held somewhere else.** That wall reads `globals.css`, converts the primitives to
// sRGB and asserts these are exactly them, on both grounds. They cannot drift from the
// palette without something going red, which is the whole of what buys the exception.
//
// `src/app/icon.svg` states its own two greys rather than importing these, and that is
// deliberate: it is not TypeScript and never will be — a favicon has to be a file a browser
// can fetch and parse on its own. The same wall pins those two as well, so there is one
// arithmetic over one stylesheet covering all three surfaces.

/**
 * The two grounds and the ink on each, in sRGB.
 *
 * Both grounds, because a `<meta name="theme-color">` takes a media query and a phone in a
 * dark room should not be handed a white status bar. What takes **only** the light one is
 * the manifest and the home-screen tile: neither has a media query to give, an operating
 * system composites an app icon on a ground of its own choosing, and an icon that assumed a
 * dark one would be ink on ink half the time.
 */
export const OUTSIDE_THE_CASCADE = {
  paper: { light: "#f0f0f0", dark: "#101010" },
  ink: { light: "#1b1b1b", dark: "#e8e8e8" },
} as const;
