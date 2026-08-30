import { describe, expect, it } from "vitest";
import { listBindings } from "./binding.ts";

// Read off `CONTEXT.md`'s Binding entry rather than off the migration: if this test and
// the schema disagree, the glossary is the one that is right.
describe("the Bindings", () => {
  it("are the vocabulary the owner already uses, in the order they are offered in", async () => {
    expect(await listBindings()).toEqual([
      { id: "tankobon", name: "Tankōbon" },
      { id: "omnibus", name: "Omnibus" },
      { id: "deluxe", name: "Deluxe" },
      { id: "must-have", name: "Must Have" },
      { id: "hardcover", name: "Hardcover" },
      { id: "paperback", name: "Paperback" },
      { id: "stapled", name: "Spillato" },
    ]);
  });
});
