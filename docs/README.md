# Documentation

This folder describes the structure and contracts of Audio Effect Builder.

- [architecture.md](architecture.md) explains the feature folders, dependency direction, and runtime data flow.
- [project-model.md](project-model.md) documents `ProjectV1`, commands, history, persistence, macros, and import/export.
- [audio-engine.md](audio-engine.md) explains browser playback, DSP graphs, live parameter updates, and metering.
- [webmcp.md](webmcp.md) documents structured agent actions and browser fallback behavior.
- [development.md](development.md) contains setup, validation, and safe extension guidance.

The documentation follows the implementation in `src/features/audio-builder`. The `app` folder is intentionally small and contains only the framework entry point, document metadata, and global styles.
