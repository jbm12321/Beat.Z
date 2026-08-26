# WebMCP Integration

## Shared state contract

`registerWebMcpTools` receives a two-function adapter:

- `getProject()` returns the current `ProjectV1` snapshot.
- `applyCommands(commands)` sends validated `ProjectCommand[]` through the same coordinator used by human interactions.

There is no parallel agent store. Agent mutations therefore create the same revisions, history entries, persistence updates, audio updates, visual highlights, and activity records as human edits.

## Browser registration

On mount, the feature coordinator checks `document.modelContext?.registerTool`. When available, it registers the structured tools with an `AbortController` signal and reports the page as connected. Cleanup aborts registration.

When the browser does not expose WebMCP, registration returns `supported: false`. The human editor, audio engine, import/export, and persistence continue normally.

## Tool groups

The current tools cover:

- inspecting the complete project;
- inspecting the module catalog;
- adding and updating modules;
- moving, connecting, disconnecting, and deleting modules;
- creating, updating, mapping, and deleting plugin controls;
- atomically applying a command batch.

Each tool validates primitive inputs, translates them into domain commands, calls the shared adapter, and returns the new revision with a concise summary. A failed atomic batch returns an error and does not mutate project state.

## Deployment boundary

WebMCP page registration and a hosting platform's published MCP declaration are separate capabilities. This code feature-detects the browser API; private-site access controls still determine which signed-in users can open the page. Do not treat an in-page “connected” indicator alone as proof that a published deployment declares an externally discoverable MCP server.
