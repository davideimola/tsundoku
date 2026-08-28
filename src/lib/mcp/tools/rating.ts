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

// The same reasoning as `reading.ts`: the owner saying it to an assistant now is first-hand.
const SAID_IN_CONVERSATION = "remembered";

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

**Set, in one sense of the word.** There is one Rating per Story per Reading, so saying it again is
an edit of that same judgement. A second opinion after reading it *again* belongs to the second
Reading: pass that Reading's \`reading\` id and both survive, which is the only way a Story ends up
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
      reading: {
        type: "string",
        description: `The Reading this judgement came out of, from \`reading_record\` or
\`stories_find\`. Pass it whenever you know it: it is what keeps a reread's score beside the first
one instead of over it.`,
      },
      provenance: {
        type: "string",
        description: `A Provenance id from \`reading_provenances\`. Leave it out when the owner is
telling you now — that is "${SAID_IN_CONVERSATION}".`,
        default: SAID_IN_CONVERSATION,
      },
    },
    required: ["story", "score"],
    additionalProperties: false,
  },
  readOnly: false,
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
        readingId: stringArgument(input, "reading"),
        provenanceId: stringArgument(input, "provenance") ?? SAID_IN_CONVERSATION,
      }),
    };
  },
};

export default [set];
