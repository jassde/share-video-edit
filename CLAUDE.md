# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend development
npm run dev          # Start Vite dev server on port 1420
npm run build        # TypeScript check + Vite bundle
npm run preview      # Preview production build

# Desktop app (runs both frontend and Rust backend)
npm run tauri dev    # Full desktop app in development mode
npm run tauri build  # Package desktop app for distribution

# Rust backend only
cd src-tauri && cargo build
cd src-tauri && cargo test
cd src-tauri && cargo clippy
```

Note: `npm run dev` alone only starts the Vite dev server. For the full desktop app with Rust backend, use `npm run tauri dev`.

## Architecture

This is a **Tauri 2** desktop application: a React/TypeScript frontend communicating with a Rust backend via Tauri's IPC.

### Frontend–Backend Communication

The key pattern is `invoke()` from `@tauri-apps/api/core`:

```typescript
import { invoke } from "@tauri-apps/api/core";
const result = await invoke<string>("command_name", { param: value });
```

For progress events (e.g. export progress), the Rust backend emits events via Tauri's event system and the frontend subscribes with `listen()` from `@tauri-apps/api/event`.

### Rust Backend (`src-tauri/`)

Commands are defined in `src-tauri/src/lib.rs` with `#[tauri::command]` and registered in the builder's `invoke_handler`. The planned commands are `load_video` (returns metadata) and `export_segments` (runs FFmpeg).

Video processing uses:
- **FFmpeg** for cutting/encoding — lossless stream-copy (`-c copy`) for keyframe-aligned cuts, re-encode for arbitrary frame-accurate cuts
- **video-rs** crate for frame-level I/O

### Frontend (`src/`)

Planned component hierarchy (per spec in `video-edit.md`):
- `<App>` — root, holds global state
- `<VideoPlayer>` — HTML5 video element with playback controls
- `<Timeline>` — draggable trim handles, zoom slider, segment markers
- `<Controls>` — play/pause, frame-step (arrow keys), keyboard shortcuts
- `<ExportDialog>` — codec selection (H.264/H.265/VP9/AV1), lossless toggle

### Tauri Permissions

Capabilities are declared in `src-tauri/capabilities/`. File system access and dialog permissions must be explicitly added there for features like the open-file dialog.

### TypeScript Config

Strict mode is enabled — `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch` are all true. The compiler only processes `src/`; `src-tauri/` is excluded from TS compilation.

## Product Spec

`video-edit.md` in the project root is the authoritative product specification. Read it for UI design decisions, codec trade-offs, keyframe handling details, and planned Tauri command signatures before implementing new features.
