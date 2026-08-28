import "server-only";

import { query } from "../db.ts";

// The Edition note, read back. **One function, and it is the only way to reach the note.**
//
// That is deliberate and it is the point of the file existing at all. What the owner thinks
// of an object decides what to buy and never feeds recommendation (ADR-0001), so no query
// that answers *what should I read next* may carry it — and the way to keep that true, when
// twelve slices are adding queries in parallel, is for the note to live behind one named
// function that a screen calls and a recommendation query has no reason to.
// `edition-note.test.ts` asserts that no other query in this directory mentions it.
//
// The MCP door must not expose this function. It is not a refusal in code — an owner's own
// screen reads it legitimately — it is the one line of the read surface that stays behind
// the web view.

/** What the owner thinks of a Volume as an object. Prose, and never a score. */
export type EditionNote = {
  note: string;
  /** When the owner last wrote it, `YYYY-MM-DD`. The only date this judgement has. */
  writtenAt: string;
};

/** The Edition note on this Volume, or `null` where the owner has written none. */
export async function findEditionNote(volumeId: string): Promise<EditionNote | null> {
  const rows = await query<EditionNote>(
    `select note, to_char(written_at, 'YYYY-MM-DD') as "writtenAt"
       from edition_note
      where volume_id = $1`,
    [volumeId]
  );

  return rows[0] ?? null;
}
