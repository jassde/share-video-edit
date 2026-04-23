# Video Trimmer

Desktop app for loading a video file, defining trim segments on a timeline, and exporting them via FFmpeg. Built with Tauri 2 (Rust backend) and React/TypeScript (frontend).

## Prerequisites

| Tool | Minimum version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org/) | 18 | `.nvmrc` provided — use `nvm use` or `fnm use` |
| [Rust](https://rustup.rs/) | 1.77 | Install via `rustup`; `rust-toolchain.toml` handles channel selection |
| [FFmpeg + FFprobe](https://ffmpeg.org/download.html) | any recent | **Must be on PATH** — app will not work without them |
| Tauri system deps | — | Follow the [Tauri v2 prerequisites guide](https://v2.tauri.app/start/prerequisites/) for your OS |

Verify FFmpeg is available:

```sh
ffmpeg -version && ffprobe -version
```

## Quick Start

```sh
git clone <repo-url>
cd video-edit
npm install
npm run tauri dev      # compiles Rust backend + starts React frontend
```

First run compiles the Rust backend (~2–5 minutes). Subsequent runs are fast.

## Build for Distribution

```sh
npm run tauri build
```

Produces a platform-native installer in `src-tauri/target/release/bundle/`.

## Commands

| Command | What it does |
|---|---|
| `npm run tauri dev` | Full app — Rust backend + React frontend with hot-reload |
| `npm run dev` | Vite frontend only (no Rust, for UI development) |
| `npm run build` | TypeScript check + Vite bundle |
| `npm run tauri build` | Package for distribution |
| `npm run test` | Run Vitest unit tests |
| `cd src-tauri && cargo test` | Run Rust unit tests |
| `cd src-tauri && cargo clippy` | Rust linter |

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` / `K` | Play / Pause |
| `←` / `→` | Step one frame backward / forward |
| `J` | Shuttle reverse (2×) |
| `L` | Shuttle forward (2×) |
| `I` | Set In point at playhead |
| `O` | Set Out point at playhead |
| `Enter` | Add segment using current In–Out range |
| `Delete` / `Backspace` | Delete active segment |
| `+` / `=` | Zoom timeline in |
| `-` / `_` | Zoom timeline out |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |

## Known Limitations

- **Lossless export** (Stream copy mode) snaps cuts to keyframe boundaries. Use re-encode for frame-accurate output.
- **GPU encoders** (NVENC, QSV, AMF, VideoToolbox) are detected at runtime and appear in the export dialog only when the host supports them.
- **VP9** exports produce `.webm`; all other codecs produce `.mp4`.
- The app needs filesystem access to your video's location. If your OS restricts certain folders, move the video to Desktop, Documents, Downloads, Videos, or Pictures.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) with:
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
