# WebMCP Collaboration Contract

WebMCP is optional browser capability detection through `document.modelContext.registerTool()`. Manual editing, audition, import/export, validation, and persistence do not depend on it.

## Tools

- `inspect-audio-project`
- `list-audio-primitives`
- `propose-audio-project-patch`
- `apply-approved-audio-project-patch`
- `render-and-analyze-audio-project`
- `inspect-audio-project-validation`
- `request-audio-plugin-build`

Inspection and proposal calls do not mutate the project. A proposal includes an expected revision, concise summary, musical purpose, and a validated atomic command batch. It appears in the page for review. Applying requires explicit page approval and the same expected revision; stale or partly invalid patches fail as a unit and return the current revision.

Agent-applied changes use `applyProjectCommands` with actor `agent`, create one revision/activity item, enter normal undo history, autosave, update the Faust engine, and highlight changed nodes.

Offline analysis uses the selected in-memory source. Build requests can only refer to an approved frozen revision. With no native service, the result is `native_build_unavailable` and contains no artifact or claim of VST3 validation.

## Deployment boundary

In-page tool registration is not a public MCP server and does not bypass private-site access. A browser/agent must be able to open the private page and support the experimental WebMCP API. The visible connection label alone is not proof of a hosting-level published MCP declaration.
