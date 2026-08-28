// What one MCP tool is, in this app.
//
// A tool is a **name, prose an assistant reads, a JSON Schema for its arguments, and a
// call into `src/core`** — and nothing else. It holds no SQL, no `if` about the model and
// no interpretation of what came back (ADR-0002): if a tool is doing something a page
// would also have to do, the thing belongs in a query or a verb, not here.
//
// The framing around it — JSON-RPC, the bearer, the status codes — is `protocol.ts` and
// the route handler. Nothing in this file or in `tools/` knows those exist.

/**
 * A JSON Schema for a tool's arguments, as MCP requires it: an object schema, always,
 * even when the tool takes nothing.
 *
 * Typed loosely on purpose. This is a wire format an assistant reads, not a shape this
 * app has an opinion about, and a stricter type here would only mean writing the schema
 * twice.
 */
export type ToolInputSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

/** One tool: what it is called, what it says it does, and what it does. */
export type McpTool = {
  /**
   * `area_question`, lower_snake_case — `stories_read`, `collection_search`. The area
   * comes first so that a client listing thirty tools lists them grouped, and it matches
   * the file the tool lives in.
   */
  readonly name: string;
  /** A short human label, for a client that shows one. */
  readonly title: string;
  /**
   * What the tool answers, in the owner's vocabulary (`CONTEXT.md`) and in enough words
   * that an assistant picks it for the right question. **This is product**: the app is
   * judged on how legible the collection is from outside (ADR-0002), and a tool
   * described as *"list stories"* is a tool that gets called for the wrong question.
   */
  readonly description: string;
  readonly inputSchema: ToolInputSchema;
  /**
   * Whether calling it changes anything. Read tools say `true` and mean it — a client is
   * allowed to call them without asking the owner first, which is the difference between
   * a fluid conversation and one interrupted per query.
   */
  readonly readOnly: boolean;
  /**
   * Answer the call. Returns plain data; the framing turns it into MCP content.
   *
   * `input` has been through no validation beyond the transport's own JSON parse: read
   * what you need out of it and pass it to a query. A refusal from the core arrives at
   * the caller as a `Refusal` and is translated there — never caught here.
   */
  run(input: Record<string, unknown>): Promise<unknown>;
};

/** The optional string at `key`, or `undefined` — the whole of argument reading. */
export function stringArgument(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * The optional number at `key`, or `undefined`.
 *
 * A string is accepted, because an assistant filling in a schema that says `number` sends
 * `"8"` often enough to matter and the alternative is a refusal the owner would never
 * understand. What is **not** accepted is anything that is not a number — `NaN` would reach
 * a verb as a value it refuses in prose about half points, which would be a lie about what
 * went wrong.
 */
export function numberArgument(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const read = Number(value);
  return Number.isFinite(read) ? read : undefined;
}
