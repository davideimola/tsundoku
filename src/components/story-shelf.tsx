import Link from "next/link";
import type { FacedWith } from "@/core/queries/cover";
import type { WallSeries } from "@/core/queries/story";
import { tint } from "@/lib/tint";
import { boundTogether, type Faced, type Shelved } from "./bound-together";
import { Cover } from "./cover";
import { Drawer } from "./drawer";

// A WALL OF STORIES, faced outwards — and the one place several Stories bound in one Volume
// become one tile (`./bound-together`).
//
// Two screens lay Stories out as covers, the Story wall and Home's *Not started*, and both
// draw them the same way: a Story with a jacket of its own wears it; a Story borrowing a
// jacket it shares with the other tales in an omnibus is drawn **with the others**, as one
// cover faced out of a stack with *N stories inside* under it; and a borrowed jacket whose
// other wearers are not on this wall is not worn at all — the Story is its own drawn cloth
// with its title, because the jacket would claim *this Story is that book*.
//
// **The stack opens onto the Stories inside it, and its open state is the URL** like every
// panel here (`./drawer`, ADR-0010): the tile is a link to the same screen with `?bound=` on
// it, the server draws the sheet, and every way out is a link back. With a script running it
// is instant and takes the keyboard; with none it is a page that comes back with the sheet
// open.

/** What a Story has to answer to stand on this shelf. */
export type ShelvedStory = Faced & {
  title: string;
  series: WallSeries | null;
};

/** The Volume a stack's jacket is taken from, where the screen could find it. */
export type LendingVolume = { id: string; title: string };

/**
 * The shelf itself: a grid of covers, one per Story or per stack.
 *
 * `opens(key)` is the screen's own address with the stack open on it — the screen knows its
 * filters, this component does not. `label` is the accessible name of a Story's tile, worded
 * by the screen (`storyDetail`). `progress` and `caption` are optional per-Story lines under a
 * tile, used by Home's *Under way*.
 */
export function StoryShelf<Story extends ShelvedStory>({
  stories,
  opens,
  label,
  progress,
}: {
  stories: Story[];
  opens: (key: string) => string;
  label: (story: Story) => string;
  progress?: (story: Story) => number | null;
}) {
  return (
    <ul className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] sm:gap-x-5 sm:gap-y-6">
      {boundTogether(stories).map((tile) => (
        <li key={tile.kind === "one" ? tile.story.id : `bound-${tile.key}`}>
          {tile.kind === "one" ? (
            <Cover
              href={`/stories/${tile.story.id}`}
              title={tile.story.title}
              tint={tint(tile.story.series?.id ?? tile.story.id)}
              label={label(tile.story)}
              image={tile.ownsItsCover ? tile.story.cover : null}
              progress={progress?.(tile.story)}
            />
          ) : (
            <Cover
              href={opens(tile.key)}
              title={tile.stories[0].title}
              tint={tint(tile.stories[0].series?.id ?? tile.key)}
              label={`${tile.stories.length} stories inside one Volume: ${tile.stories
                .map((story) => story.title)
                .join(", ")}`}
              image={tile.cover}
              stacked
              caption={
                <>
                  <span className="font-semibold text-foreground">
                    {tile.stories.length} stories
                  </span>{" "}
                  inside
                </>
              }
            />
          )}
        </li>
      ))}
    </ul>
  );
}

/** The stack the URL names, among the tiles this shelf draws, or `null`. */
export function theOpenStack<Story extends ShelvedStory>(
  stories: Story[],
  key: string | undefined
): Extract<Shelved<Story>, { kind: "bound" }> | null {
  if (!key) return null;

  for (const tile of boundTogether(stories)) {
    if (tile.kind === "bound" && tile.key === key) return tile;
  }
  return null;
}

/**
 * The Volume a jacket is lent by, found by the jacket's own address among the Volumes the
 * screen has read — the Story wall's query does not name it (`./bound-together`). `null`
 * where it is not among them, and then the sheet simply has no way onto the Volume.
 */
export function theLendingVolume(
  cover: FacedWith,
  volumes: { id: string; title: string; cover: FacedWith | null }[]
): LendingVolume | null {
  const lending = volumes.filter((volume) => volume.cover?.url === cover.url);
  return lending.length === 1 ? { id: lending[0].id, title: lending[0].title } : null;
}

/**
 * The sheet a stack opens onto: the jacket, the Stories inside it — each a way onto its own
 * page, by name in the serif — and the Volume they are bound in.
 */
export function StackSheet({
  stack,
  volume,
  closesTo,
}: {
  stack: { cover: FacedWith; stories: ShelvedStory[] };
  volume: LendingVolume | null;
  closesTo: string;
}) {
  const first = stack.stories[0];

  return (
    <Drawer
      title={volume?.title ?? "Bound in one Volume"}
      description={`${stack.stories.length} stories in this Volume`}
      closesTo={closesTo}
    >
      <div className="flex items-end gap-4">
        <div className="w-16 shrink-0">
          <Cover
            title={volume?.title ?? first.title}
            tint={tint(first.series?.id ?? first.id)}
            image={stack.cover}
            size="thumb"
          />
        </div>
        {volume ? (
          <Link
            href={`/collection/${volume.id}`}
            className="inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-cloth underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open the Volume
          </Link>
        ) : null}
      </div>

      <ul className="mt-5">
        {stack.stories.map((story) => (
          <li key={story.id}>
            <Link
              href={`/stories/${story.id}`}
              className="flex min-h-12 items-center justify-between gap-3 border-t border-border py-2 outline-none hover:text-cloth focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="font-heading text-lg font-semibold leading-snug">{story.title}</span>
              <span aria-hidden="true" className="text-muted-foreground">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Drawer>
  );
}
