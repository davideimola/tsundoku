import type { MetadataRoute } from "next";
import { OUTSIDE_THE_CASCADE } from "./outside-the-cascade";

// THE WEB APP MANIFEST — what the phone reads when the owner adds the library to a home
// screen.
//
// It is worth having for one reason, and it is the reason the whole application exists:
// **the Collection is answered standing in a fumetteria** (#18, user story 24). An icon on
// the home screen and `display: standalone` is the difference between that being an app the
// owner opens and a URL they have to find in a browser with a tab bar over it.
//
// Two things about it are constraints rather than choices, and both come from it being read
// by an operating system rather than by the document:
//
//   - **it takes one ground.** A manifest has no media query, so `theme_color` and
//     `background_color` here are the light paper and nothing else. The `<meta>` in
//     `./layout.tsx` is the one that carries both, and on a phone that is the one the status
//     bar actually follows.
//   - **it must be fetchable without a cookie.** Chrome fetches a manifest with credentials
//     omitted unless the link says otherwise, so behind the owner gate it would answer
//     `307 /signin` and the install would silently never be offered. `src/proxy.ts` excludes
//     it by name, beside the favicon and for the same stated reason — and nothing under it is
//     library data: an application's name and its logo are already on the sign-in screen.
//
// `start_url` is `/`, which is behind the gate, and that is correct: opening the app from the
// home screen with no session lands on the sign-in screen, which is what should happen.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "tsundoku",
    // What fits under an icon. The name is already short enough to be its own short name,
    // which is the argument for a one-word application name in the first place.
    short_name: "tsundoku",
    description:
      "A single-owner library: what has been read, what it was worth, what is on the shelf.",
    start_url: "/",
    display: "standalone",
    background_color: OUTSIDE_THE_CASCADE.paper.light,
    theme_color: OUTSIDE_THE_CASCADE.paper.light,
    icons: [
      // The drawn file, which is the one that scales: a mark of three rectangles has no
      // size it is right at, and SVG is a format the install criteria accept.
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      // The raster, for everything that will not take the drawing — iOS outright, and
      // Android's adaptive icon, which crops to a circle and needs the margin
      // `./apple-icon.tsx` leaves it.
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "maskable" },
    ],
  };
}
