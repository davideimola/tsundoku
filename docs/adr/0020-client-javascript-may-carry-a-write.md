# Client JavaScript may carry a write, and the fumetteria is not a place this app is used

Supersedes ADR-0010. The owner surface may depend on client JavaScript, writes included. A
control no longer owes an unscripted twin.

## What forced it

ADR-0010 kept half of an older stance — *"nothing the owner is about to commit is lost because
a script did not load"* — and paid for it with one place: **the owner standing in a fumetteria
on the shop's signal**. The owner says that place is not real. They photograph the book and
catalogue it at home, in no hurry; putting a volume in the collection or on the wish list is
not something that has to happen before leaving the shop.

The ADR also contradicted itself where it mattered most. The one control that would earn its
keep on a shop floor — the ISBN scanner on `/add` (`src/components/scan.tsx`) — **is a client
script**. The screen the rule was protecting already could not do the job it was protected for
without JavaScript running.

Against a single reader on an iPhone 16 and a MacBook Pro, the rule was buying nothing and
charging for it: the stories a Volume carries were about to be typed into a textarea because
that was the shape a form can post without a script.

## Consequences

**Nothing standing is wrong.** The four checkbox multi-selections — the route picker banded by
Series, the Inbox wall, and the two strike lists — and the `counter-increment` tick counters
keep working and stay as they are. There is no rewrite campaign; one of them is the screen the
owner points at when asked what good looks like.

**The eighteen comments that restate the old stance now bind nothing.** A future reader meeting
one should read it as history.

**New work may assume React on the owner surface**, and a write may live in it.

## Considered and not taken

- **Free `/add` alone and hold the rule elsewhere.** Two rules, the second discovered by
  accident, for a distinction nobody can state.
- **Rewrite the four existing walls with client components.** Work on screens nobody is
  complaining about.
