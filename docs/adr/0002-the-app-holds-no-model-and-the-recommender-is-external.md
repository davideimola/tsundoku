# The app holds no model and the recommender is external

The app exists so that reading recommendations get better, and it contains **no LLM and
spends no tokens**. Recommendation happens in ChatGPT or Claude, which read the collection
through this app's **MCP server**; the owner already pays for those assistants and
deliberately does not want inference billed to his own project. The app is a database with
**two doors**: a web view for the owner, and MCP for an external reader.

## Consequences

- **MCP read queries are a first-class product surface**, not an integration bolted on
  afterwards. The app is judged on how legible the collection is from outside, not on how
  well it advises — there is nothing here to look for a recommender in.
- Anything the owner states as a constraint in prose (*"don't accumulate too many unread
  books"*, *"take it slowly, given the cost"*) has to be readable through MCP, because it
  is an instruction to the external advisor rather than a note to self.
