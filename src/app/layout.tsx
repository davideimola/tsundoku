import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "tsundoku",
  description:
    "A single-owner library: what has been read, what it was worth, what is on the shelf.",
};

// Used phone-in-hand in a shop and at a desk (user stories 31), so mobile-first and
// the width of the device. User zoom stays on.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// THE THREE FACES. What each one is *for* is decided in `globals.css`, beside the palette;
// what is decided here is which families they are and what they cost to load.
//
// This retires the stance that stood here until the visual direction was decided — *"no web
// font: a first clone needs no network for the page to look right, and visual work comes
// after the thing works"*. It was provisional in its own words, and this is the ticket it
// was waiting for. What it was protecting is kept: `next/font` downloads these at build and
// **serves them from this origin**, so the owner's browser asks Google for nothing at run
// time and a reader is not announced to a third party by opening a page.
//
// What it costs is a build that reaches the network once. Be precise about the failure,
// because the two halves differ: `next dev` logs *"Failed to download … Using fallback font
// instead"* and carries on in the stacks `globals.css` keeps behind each variable, while
// `next build` **fails**. So a clone with no network still runs; an image built with no
// network does not.
//
// `display: "swap"` throughout: the library is read on a phone in a shop on a bad signal
// (user story 24), and a page that withholds its text until a font arrives is a page that
// is blank exactly when it is most needed.

// The application's own voice. **Archivo for its width axis**, which is the whole reason
// this family and not another: the same grotesque has to set a heading wide and a spine
// narrow, and doing that with two families would be two voices. `latin-ext` because the
// library is Italian and its bindings are Japanese — *tankōbon* has a macron in it.
const grotesque = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  display: "swap",
  variable: "--face-grotesque",
});

// The owner's own prose, and nothing else. Its italic is loaded rather than synthesised
// because the screens quote them as quotations, and a slanted roman is what a browser
// invents when it has not been given the real thing.
//
// **Not preloaded**, deliberately: it appears only where the owner has written something,
// so it is the one face that is not on the critical path of every screen. It arrives a
// beat after the words it will set, which is the right trade on a shop's signal.
const serif = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
  preload: false,
  variable: "--face-serif",
});

// Numbers, ISBNs, dates and prices. `latin` alone: nothing it sets is a word.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--face-mono",
});

// shadcn ships a full set of dark tokens but hangs them off a `.dark` class, so
// without this line they are dead code. Following the operating system is therefore
// using what shadcn supplies rather than adding to it. It runs before first paint,
// which is what keeps a white flash out of a dark room.
const theme =
  "try{document.documentElement.classList.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches)}catch(e){}";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${grotesque.variable} ${serif.variable} ${mono.variable}`}
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: the no-flash theme setter */}
        <script dangerouslySetInnerHTML={{ __html: theme }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
