# The conversion

One command, run once, by the owner:

```sh
pnpm convert:runs --dry-run    # read the library, print the plan, write nothing
pnpm convert:runs              # convert the five runs and strike the hand-made Path
```

It turns the five lines the owner keeps volume by volume — **One-Punch Man**, **Slam Dunk**,
**La via del grembiule**, **Fullmetal Alchemist** and **Death Note**, fifty-one Stories between
them — into five works, and strikes the *Slam Dunk* Path, which was never a route: four of
twenty volumes copied in one at a time because *I want to read this* had no other door before a
**Want** was a fact of its own.

Afterwards there is one place to say *Slam Dunk is a 9*, and *seven of twenty* is countable,
because the merge serializes each work to the length of its line.

## It is a script and not a migration

Three reasons, at length in the header of [`runs.ts`](runs.ts), in short here:

- **the gesture already exists, and it is TypeScript.** This presses
  `mergeSeriesIntoOneStory` five times and holds nothing of its own but the guard and the five
  names. A `0014_` file would be that verb's seven refusals written again in SQL.
- **a migration runs itself.** `pnpm db:migrate` is the deployment's init container, so a
  conversion shipped as one would run on a deploy nobody was watching, and its refusal would be
  a container that will not start.
- **it is not schema.** Nothing here adds a column. The shape it moves the owner's rows onto
  was built by #35 to #41, and both shapes already exist in the database.

The owner reserved the number `0014_` for this in case it shipped as a migration. It does not,
so that number goes unused and the journal still ends at 10.

## What it refuses

The whole conversion, while **any** narrative it would collapse carries a Pass or a Rating — and it
reads all five lines before it touches the first, so a foreseen refusal leaves nothing half
done. On the live library today that count is zero, which is what makes this lossless; the
guard is here so it stays true whenever the command is actually taken.

What it does not promise is one transaction over all five: one verb is one transaction, and
this presses six of them. A merge that refuses for one of its own reasons therefore stops the
conversion and names the lines already converted, and running the command again finishes the
rest.

It also refuses a library that has no line of one of the five names, and one where two ledgers
share a name — *Fullmetal Alchemist* standard and Ultimate Deluxe Edition — rather than
guessing which run was meant.

A line a previous run already converted is **left alone rather than refused**, which is what
makes running it twice safe: each merge is its own transaction, so a conversion interrupted in
the middle is finished by running the command again.

## Rehearsing it

`DATABASE_URL` is the whole of where it writes, so the rehearsal and the real thing are one
command pointed at two databases. Locally:

```sh
pnpm db:reset          # a database with nothing in it
pnpm import:sheets     # the owner's own rows, or db/import/fixtures for the committed ones
pnpm convert:runs --dry-run
```

`db/convert/runs.test.ts` is the same thing at Seam 1, against a library built through the real
verbs in the shape the live one has.
