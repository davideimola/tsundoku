import { describe, expect, it } from "vitest";
import { readSbnSearch } from "./records.ts";

// **The licensed pure derivation again, and for the same reason `covers.test.ts` has it**
// (`vitest.config.ts`): the text of a source's answer in, *found* / *none* / *unanswered*
// out. Nothing here opens a socket, and what the screen does with these answers is Seam 1 —
// `queries/isbn.test.ts`, which hands the question a source of its own.
//
// It earns the licence on the same two failures, and adds a third that is specific to this
// source. SBN is **an undocumented XHR surface of somebody's Liferay site**
// (`docs/research/cover-images-by-isbn.md` §5) which returned 502 and then 503 for stretches
// of the session that measured it. So:
//
//   1. A backend that is down is **unanswered**, never "no such book". Recording a 503 as
//      "SBN has never heard of this ISBN" is the same false zero the cover research produced
//      once already, and the owner would read it standing in a shop.
//   2. A body that will not parse is unanswered, not an empty record.
//   3. **What is parsed is a librarian's record, not a form.** `{One piece}100 / Eiichiro Oda`
//      is one field carrying a uniform title, a volume number and a statement of
//      responsibility, and turning it into the two words this app's Title field wants is a
//      derivation with real cases in it — every fixture below is a body this session actually
//      received from `opac.sbn.it`.

// One Piece 100, Star Comics. Two records for one ISBN, which is ordinary: a reprint is its
// own record. Whitespace as the endpoint sends it, tabs included.
const ONE_PIECE = `
 {
  "status": "success",
  "data": {
  	 "pagination": { "total":1, "current": 1, "max": 4 },
  	 "total": 2,
     "results" : [
    {
      "id": "ITICCUROV0014297",
      "index": 1,
      "href": "/ITICCUROV0014297",
      "snippet": "",
      "title": { "text": "", "info": "{One piece}100 / Eiichiro Oda" },
      "infos": [ "Bosco (Pg) : Star Comics, 2022", "Fa parte di: One piece",
                 "Testo - Monografia [IT\\\\ICCU\\\\ROV\\\\0014297] " ],
      "type":"text"
    },
    {
      "id": "ITICCUMOD1738776",
      "index": 2,
      "href": "/ITICCUMOD1738776",
      "snippet": "",
      "title": { "text": "", "info": "{One piece}100 : La bambina diabolica / Eiichiro Oda" },
      "infos": [ "Bosco (Pg) : Star Comics, 2022", "Fa parte di: One piece" ],
      "type":"text"
    }
   ]
  }
}`;

// The second of those two records, on its own: one ISBN, and a title carrying the chapter's
// name after a colon.
const WITH_A_SUBTITLE = `
 {
  "status": "success",
  "data": {
  	 "total": 1,
     "results" : [
    {
      "id": "ITICCUMOD1738776",
      "index": 1,
      "title": { "text": "", "info": "{One piece}100 : La bambina diabolica / Eiichiro Oda" },
      "infos": [ "Bosco (Pg) : Star Comics, 2022", "Fa parte di: One piece" ],
      "type":"text"
    }
   ]
  }
}`;

// *Dimentica il mio nome*, Bao Publishing. The heading carries the author rather than the
// title, which is why the title is read off `info` and never off `text`.
const ZEROCALCARE = `
 {
  "status": "success",
  "data": {
  	 "total": 6,
     "results" : [
    {
      "id": "ITICCUANA0493712",
      "index": 1,
      "href": "/ITICCUANA0493712",
      "title": { "text": "Zerocalcare", "info": "Dimentica il mio nome / Zerocalcare [i.e. Michele Rech]" },
      "infos": [ "Milano : Bao Publishing, 2014", "Testo - Monografia [IT\\\\ICCU\\\\ANA\\\\0493712] " ],
      "type":"text"
    }
   ]
  }
}`;

// An ISBN nothing was ever published under. The endpoint answers *success* with an empty
// list, which is the only "no" this source has.
const NOTHING = `
 {
  "status": "success",
  "data": {
  	 "pagination": { "total":0, "current": 1, "max": 4 },
  	 "total": 0,
     "results" : [
   ]
  }
}`;

describe("reading what SBN said about an ISBN", () => {
  it("takes the title and the publisher off the first record", () => {
    expect(readSbnSearch(ONE_PIECE)).toEqual({
      answer: "found",
      record: { title: "One piece 100", publisher: "Star Comics" },
    });
  });

  it("puts the space back where the braces of a uniform title were", () => {
    // `{One piece}100` is a uniform title and a volume number in one field. Stripping the
    // braces without putting a space back reads `One piece100`, which would be typed into
    // the Title field and stay there.
    const said = readSbnSearch(ONE_PIECE);

    expect(said.answer === "found" && said.record.title).toBe("One piece 100");
  });

  it("keeps the object's name and drops the subtitle", () => {
    // SBN's *other* record for the same ISBN carries `: La bambina diabolica`. A Volume's
    // title in this library is what the object is called on a shelf — *One piece 100* — and
    // the chapter's own title is not part of it.
    expect(readSbnSearch(WITH_A_SUBTITLE)).toEqual({
      answer: "found",
      record: { title: "One piece 100", publisher: "Star Comics" },
    });
  });

  it("reads the title off the record's own statement and never off the heading", () => {
    // The heading here is *Zerocalcare*, the author. A record whose title came from `text`
    // would catalogue a graphic novel called after the person who drew it.
    expect(readSbnSearch(ZEROCALCARE)).toEqual({
      answer: "found",
      record: { title: "Dimentica il mio nome", publisher: "Bao Publishing" },
    });
  });

  it("takes the publisher out of the imprint and leaves the place and the year behind", () => {
    // `Milano : Bao Publishing, 2014` — place, publisher, year, in one line. The form asks
    // for the publisher, so that is what is read out of it.
    const said = readSbnSearch(ZEROCALCARE);

    expect(said.answer === "found" && said.record.publisher).toBe("Bao Publishing");
  });

  it("finds the imprint wherever in the notes it sits", () => {
    const moved = ZEROCALCARE.replace(
      '"infos": [ "Milano : Bao Publishing, 2014",',
      '"infos": [ "Fa parte di: Qualcosa", "Milano : Bao Publishing, 2014",'
    );
    const said = readSbnSearch(moved);

    expect(said.answer === "found" && said.record.publisher).toBe("Bao Publishing");
  });

  it("answers found with no publisher rather than refusing a record that has no imprint", () => {
    // The title is what the owner cannot type quickly. A record with an unreadable imprint
    // is still most of the answer, and the field is left for them to fill.
    const bare = ZEROCALCARE.replace('"Milano : Bao Publishing, 2014"', '"Senza luogo"');

    expect(readSbnSearch(bare)).toEqual({
      answer: "found",
      record: { title: "Dimentica il mio nome", publisher: null },
    });
  });

  it("answers none where SBN holds no record under that ISBN", () => {
    expect(readSbnSearch(NOTHING)).toEqual({ answer: "none" });
  });
});

describe("what is not an answer", () => {
  it("answers unanswered for a body that will not parse", () => {
    // Liferay serves an HTML error page while the JSON API is down, and the homepage keeps
    // answering 200 throughout.
    const said = readSbnSearch("<html><title>Errore</title></html>");

    expect(said.answer).toBe("unanswered");
  });

  it("answers unanswered where the endpoint reports its own failure", () => {
    expect(readSbnSearch('{"status":"error","data":{}}').answer).toBe("unanswered");
  });

  it("answers unanswered where there is a record and no title in it", () => {
    // Our failure to read a librarian's field, not the library's failure to hold the book —
    // so it is never written down as "no such ISBN".
    const untitled = ZEROCALCARE.replace(
      '"info": "Dimentica il mio nome / Zerocalcare [i.e. Michele Rech]"',
      '"info": ""'
    );

    expect(readSbnSearch(untitled).answer).toBe("unanswered");
  });

  it("says why, so the sentence beside the field is about what happened", () => {
    const said = readSbnSearch("<html>503</html>");

    expect(said.answer === "unanswered" && said.because).toBeTruthy();
  });
});
