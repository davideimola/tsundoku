// **The palette as sRGB, for the surfaces this application's stylesheet cannot reach.**
//
// There are three of them and they have one thing in common: none is inside the document,
// so none can resolve a `var()`. A browser tab draws the favicon in its own chrome; an
// operating system paints a home-screen tile and a splash screen from a manifest it read
// before the page existed; the phone's status bar takes a `theme-color` from a `<meta>`.
// Ask any of them for `--paper` and they get nothing.
//
// So this file names the colours those surfaces need — the ground, and the three bindings the
// mark is drawn in (cloth, gilt and ink, ADR-0026) — which makes it the fifth file in `src/` allowed to
// (`src/app/palette.test.ts`) — and it is allowed for the same reason `lib/tint.ts` is:
// **it is held somewhere else.** That wall reads `globals.css`, converts the primitives to
// sRGB and asserts these are exactly them, on both grounds. They cannot drift from the
// palette without something going red, which is the whole of what buys the exception.
//
// `src/app/icon.svg` states its own colours rather than importing these, and that is
// deliberate: it is not TypeScript and never will be — a favicon has to be a file a browser
// can fetch and parse on its own. The same wall pins those two as well, so there is one
// arithmetic over one stylesheet covering all three surfaces.

/**
 * The two grounds, and the three colours the mark is drawn in on each, in sRGB.
 *
 * Both grounds, because a `<meta name="theme-color">` takes a media query and a phone in a
 * dark room should not be handed a white status bar. What takes **only** the light one is
 * the manifest and the home-screen tile: neither has a media query to give, an operating
 * system composites an app icon on a ground of its own choosing, and an icon that assumed a
 * dark one would be ink on ink half the time.
 */
export const OUTSIDE_THE_CASCADE = {
  paper: { light: "#f2f0ea", dark: "#161a23" },
  ink: { light: "#232836", dark: "#e9e6de" },
  /** Bookcloth as a surface — `--cloth-fill`, the top spine of the mark. */
  cloth: { light: "#2f3f7a", dark: "#3d4f98" },
  /** The gilded edge — `--gilt`, the middle spine of the mark. */
  gilt: { light: "#a77b22", dark: "#d9b062" },
} as const;
