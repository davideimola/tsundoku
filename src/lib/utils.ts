import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// One class list out of several, with the later word winning where two describe the same
// property — the ordinary shadcn helper, and it is bought rather than written.
//
// What is added to it is **the type sizes this application declared of its own**
// (`src/app/globals.css`): the display scale the serif sets names in (`title`, `name`,
// `section`, `figure`, each with a desk size), `label`, which the interface's small sans is
// set in, `tab`, the phone's bottom bar, and `prose`, the size the owner's own words are set
// at. Tailwind's merger knows the sizes it shipped with and reads anything else after `text-`
// as a colour, so `cn("text-label", "text-muted-foreground")` would quietly return the colour
// alone and the label would come out at the inherited size — which is how the phone's bottom
// bar once shipped, wrong in a way that looks like a spacing mistake rather than a lost class.
//
// So they are declared here beside the sheet that declares them. A further custom size
// added there is a word here, and `./utils.test.ts` is what says so out loud.
export const SIZES = [
  "title",
  "title-lg",
  "name",
  "name-lg",
  "section",
  "figure",
  "prose",
  "label",
  "tab",
] as const;

const merge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: [...SIZES] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}
