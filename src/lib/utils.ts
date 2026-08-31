import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// One class list out of several, with the later word winning where two describe the same
// property — the ordinary shadcn helper, and it is bought rather than written.
//
// What is added to it is **the two type sizes this application declared of its own**
// (`src/app/globals.css`): `text-eyebrow`, which the whole chrome is built out of, and
// `text-prose`, the one size the owner's own words are set at. Tailwind's merger knows the
// sizes it shipped with and reads anything else after `text-` as a colour, so
// `cn("text-eyebrow", "text-muted-foreground")` quietly returned the colour alone and the
// label came out at the inherited size — visibly wrong in the phone's bottom bar, and wrong
// in a way that looks like a spacing mistake rather than a lost class.
//
// So the two are declared here beside the sheet that declares them. A third custom size
// added there is a line here, and `./utils.test.ts` is what says so out loud.
const merge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["eyebrow", "prose"] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}
