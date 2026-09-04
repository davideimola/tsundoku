import { FIRST_HAND } from "@/core/queries/provenance";
import { type RatingScale, setRating } from "@/core/verbs/rating";
import { type McpTool, numberArgument, stringArgument } from "../tool.ts";

// The Rating area: the owner's judgement of a **Story**, and the other half of the sentence
// this whole app was built for — *"I finished volume 23, I'd give it an 8"*.
//
// It is a verb on something that already exists, so this door calls it directly (ADR-0005).
// It attaches to a Story and to nothing else: what the owner thinks of an *object* — the
// print, the translation, the value for money — is an Edition note, a different judgement
// that never feeds recommendation, and there is deliberately no tool here that writes one
// against a Volume.

const set: McpTool = {
  name: "rating_set",
  title: "Set the owner's Rating of a Story",
  description: `Record what the owner thought of a **Story**: a score from 1 to 10 in half points, and
the prose they said about it.

**Write the prose.** It is the whole value of the record — a score alone cannot tell *liked it* from
*liked it for the art* — so pass what they actually said, in their words, whenever they said
anything. A Rating with prose is evidence; a bare number is a rank.

A Rating is **of a Story, never of a Volume**: the object was not the thing that was good or bad. A
Story spanning twenty volumes has one judgement, not twenty.

**Set, in one sense of the word.** There is one Rating per Story per Pass, so saying it again is
an edit of that same judgement. A second opinion after going through it *again* belongs to the
second Pass: name that Pass's \`pass\` id and both survive, which is the only way a Story ends up
with two scores.`,
  inputSchema: {
    type: "object",
    properties: {
      story: {
        type: "string",
        description: `The Story's id, from \`stories_all\`. A Story the library does not have cannot
be rated into existence — propose it with \`inbox_propose_story\`.`,
      },
      score: {
        type: "number",
        description: `1 to 10, moving in half points: 8, 8.5, 9. Convert nothing silently — an owner
who says "four out of five" is telling you a coarser number, so pass 8 and say \`scale\` is
"coarse".`,
      },
      prose: {
        type: "string",
        description:
          "What they said about it, in their words. Leave it out only if they said none.",
      },
      scale: {
        type: "string",
        description: `"half-points" for a score on this scale, "coarse" for one given out of 5 and
doubled onto it. The judgement is theirs either way; the precision is not, and a reader of this
library needs to know which. Defaults to "half-points".`,
        default: "half-points",
      },
      pass: {
        type: "string",
        description: `The Pass this judgement came out of, from \`pass_record\` or
\`stories_find\`. Name it whenever you know it: it is what keeps a second time through's score
beside the first one instead of over it.`,
      },
      provenance: {
        type: "string",
        description: `A Provenance id from \`pass_provenances\`. Leave it out when the owner is
telling you now — that is "${FIRST_HAND}".`,
        default: FIRST_HAND,
      },
    },
    required: ["story", "score"],
    additionalProperties: false,
  },
  readOnly: false,
  // Rating the same Pass twice overwrites the prose the owner wrote about it, in place
  // and with no history kept — a Rating is one per Story and Pass, so the second call
  // updates the first rather than joining it. That is the only write on this door that
  // destroys something the owner authored, and a client is right to confirm it.
  destructive: true,
  async run(input) {
    return {
      // `Number.NaN` where an assistant sent something that is not a number at all, which
      // the verb refuses as a score in half points. Nothing is corrected here: the score is
      // the one value in this app the owner would never want guessed at.
      rating: await setRating({
        storyId: stringArgument(input, "story") ?? "",
        score: numberArgument(input, "score") ?? Number.NaN,
        prose: stringArgument(input, "prose"),
        scale: stringArgument(input, "scale") as RatingScale | undefined,
        // The core says `passId`; this door says `pass`, which is the word an assistant reads.
        passId: stringArgument(input, "pass"),
        provenanceId: stringArgument(input, "provenance") ?? FIRST_HAND,
      }),
    };
  },
};

export default [set];
