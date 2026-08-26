# Audio Effect Builder

A browser-based visual audio-effect builder. The application uses Web Audio for auditioning, a reducer-style project command system for every edit, local browser persistence, portable JSON projects, and optional WebMCP tool registration.

## Start here

- [Architecture](docs/architecture.md)
- [Project model and commands](docs/project-model.md)
- [Audio engine](docs/audio-engine.md)
- [WebMCP integration](docs/webmcp.md)
- [Development and reproduction](docs/development.md)

## Quick start

Requires Node.js 22.13 or newer and npm.

```bash
npm ci
npm run dev
```

Open the local URL printed by the development server.

## Available commands

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
npm start
```

`npm start` serves a completed production build.

## Local data and credentials

This repository does not require API keys or environment variables. Project autosaves and selected audition audio remain in the browser; local audio is not part of the source repository. `.openai/hosting.json` contains the existing Sites project identifier and no authentication token.

Use `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` before sharing a change.
