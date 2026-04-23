# Executive Summary  
This specification outlines a cross-platform desktop application for interactive video trimming.  It combines a React-based UI with a Rust/Tauri backend, integrating the local FFmpeg executable and the Rust `video-rs` crate for media processing. Users can load a single video file, define one or more trimmed segments via intuitive timeline controls (draggable handles, In/Out buttons, frame-step shortcuts), and export the results with chosen codecs and lossless settings. The Rust backend exposes Tauri commands (using `#[tauri::command]`) to query video metadata, run FFmpeg cuts, and report progress. Communication between frontend and backend uses Tauri’s `invoke` API and event system【62†L280-L284】【62†L292-L300】. This spec covers project goals, user workflows, UI design, component and state structure, backend API design, FFmpeg usage (lossless vs. re-encode, keyframe handling), performance considerations, file I/O and error handling, and includes illustrative UI mockup suggestions and comparison tables of codec/export options.  

## Project Overview and Goals  
The **Video Timeline Trimmer** app enables precise cutting of videos on the desktop with high fidelity. Its primary goal is to let users visually mark start and end points of segments on a timeline and export those segments efficiently. Key objectives include: (1) **Interactive Trimming:** allow multiple segments to be defined on a single video timeline via drag handles or buttons; (2) **Responsive Playback:** provide play/pause and frame-stepping (←/→ for one frame) to locate edit points; (3) **Flexible Export:** enable exporting clips with user-chosen output directory, codec, and lossless vs. re-encoded options; (4) **High Performance:** use efficient processing (FFmpeg “copy” mode when possible, multithreading, and progress reporting) to minimize delays. The app uses the local FFmpeg tool for actual cutting, and the Rust `video-rs` library for reading/writing video streams【59†L314-L322】【59†L339-L347】. This dual approach leverages FFmpeg’s robust format support and `video-rs`’s Rust-native APIs, while keeping heavy processing on the backend. All heavy tasks occur off the UI thread, with progress events sent to the React frontend via Tauri events.  

## User Stories and UX Flows  
- **Load Video:** The user clicks “Open” or drags a file onto the app; a system file dialog returns a video path. The app validates the path, reads metadata (duration, resolution, FPS) via a Rust command, and initializes the player and timeline. The video preview loads (e.g. via a `<video>` element sourcing the local file path), paused at time 0.  
- **Select Segments:** The user can create one or more segments by dragging “In” (start) and “Out” (end) handles on the timeline. Visually, each segment is highlighted on the timebar. Alternatively, the user can seek to a frame, then press “Set Start” or “Set End” buttons to snap the nearest handle to the current time. Keyboard shortcuts also aid precision: **Space** toggles play/pause, **Left/Right** arrow steps one frame backward/forward (useful to align on keyframes). The UI updates current time and segment extents in real time.  
- **Zoom Timeline:** The timeline supports zooming (e.g. via a slider or pinch gesture), allowing fine-grained adjustments. No hard constraints are imposed; the user can zoom in as far as frame-level resolution. Zoom controls dynamically rescale the timeline view and handles.  
- **Multiple Segments:** Users can add additional segments (e.g. a “+” button or by dragging anew). Each segment is listed or displayed, with controls to delete or adjust it. In the export UI, each segment can become a separate clip or be concatenated per user choice.  
- **Export Clips:** Upon clicking “Export,” a modal appears where the user picks an output folder, chooses a codec (e.g. H.264, H.265, etc.), and toggles a “Lossless” option. If “Lossless” is checked, the app will attempt stream-copying (no re-encoding) for video and audio; otherwise it will re-encode according to settings. The user confirms export, and a progress bar or spinner appears. Each segment is processed (via FFmpeg or `video-rs`); on completion, a success dialog appears and optionally the output folder opens. Errors (e.g. invalid path, unsupported codec, FFmpeg failure) are caught and shown as alerts.  

## Architecture and Technical Design  

### Rust Backend & Tauri Commands  
The backend is written in Rust with Tauri. We define Tauri commands (Rust functions tagged `#[tauri::command]`) to handle tasks like loading video info and exporting segments. For example:  
```rust
#[tauri::command]
fn load_video(path: String) -> Result<VideoMetadata, String> { /*...*/ }
```
These commands are registered in the Tauri builder (e.g. `tauri::Builder::default().invoke_handler(tauri::generate_handler![load_video, export_segments])...run(...)`)【62†L280-L284】. The front-end calls them via `invoke('load_video', { path })` or `invoke('export_segments', { … })`【62†L292-L300】. The Rust code uses `std::process::Command` (or the `tauri_plugin_shell` crate’s extensions) to spawn FFmpeg processes【18†L2291-L2300】. For example, `Command::new("ffmpeg").args(&["-i", &path, ...]).spawn()`. Video I/O (reading/writing frames) can also use the `video-rs` crate: e.g. `let mut decoder = Decoder::new(source_url)?; for frame in decoder.decode_iter() { ... }`【59†L314-L322】 to process frames in Rust. The output segments can be written using `video_rs::encode::Encoder`【59†L339-L347】 or by letting FFmpeg handle encoding.  

Progress reporting uses Tauri’s event system. The Rust code can periodically emit progress events (e.g. `app.emit_all("export-progress", payload)`) while FFmpeg runs (e.g. parsing `-progress pipe:1` output), and the React frontend listens for those events to update a progress bar. Errors thrown in commands (e.g. `Err("FFmpeg failed")`) cause the JS promise to reject【62†L472-L480】, which the front-end catches to show error messages.  

### React Frontend & Component Structure  
The UI is built with React. Key components include:  
- **`<App>`** – top-level, holds global state (via Context or a state management library) including current video metadata, segments list, and playback state.  
- **`<VideoPlayer>`** – displays the video preview (HTML5 `<video>` or canvas) and keeps track of current time. It exposes callbacks to control play/pause and frame-stepping.  
- **`<Timeline>`** – visual track showing the entire video duration. It renders thumbnails or waveform background and overlays segment bars. Each segment has draggable left/right handles. The component takes props like `segments` (array of `{start, end}`) and callbacks `onSegmentUpdate(id, newStart, newEnd)`. Zoom controls adjust the time-to-pixel scale.  
- **`<Controls>`** – playback and editing buttons (“Play/Pause”, “Set In”, “Set Out”, etc.). Clicking “Set In” moves the current segment’s start to the current time.  
- **`<ExportDialog>`** – a modal with fields: output directory (filesystem dialog via Tauri), codec dropdown, Lossless toggle, and an “Export” button.  
The app uses React state/hooks (e.g. `useState`, `useReducer`) or a library like Redux to store segments and UI flags. When a segment handle is dragged or a “Set In/Out” clicked, the app updates state and re-renders the timeline. Keyboard events (Space, Arrow keys) are registered to control the video: Space toggles play (`videoElement.play()`/`.pause()`), Left/Right invokes `videoElement.currentTime += ±(1/fps)` to step exactly one frame.  

### Frontend–Backend Communication  
From React, calling backend commands is done via Tauri’s `invoke` function:  
```js
import { invoke } from '@tauri-apps/api/core';
await invoke('load_video', { path: videoPath });
```
This returns a JS Promise. The returned value is JSON (serialized from Rust structs). For example, `load_video` might return `{duration: 42.5, width: 1920, height: 1080}`. We store that in state. For exporting, we pass the segments array and options to an `export_segments` command. As FFmpeg runs, we listen to a Tauri event (e.g. `await window.__TAURI__.event.listen('export-progress', callback)`) to get progress updates. Progress events are emitted from Rust using `tauri::AppHandle::emit_all(...)`【18†L2321-L2324】. The UI then updates a progress bar accordingly.  

## Video Processing (FFmpeg and video-rs)  

### Lossless Cutting (Stream Copy)  
For “lossless” export, we use FFmpeg in stream-copy mode (`-c copy`). This avoids re-encoding, so there is no quality loss beyond original. For example:  
```
ffmpeg -ss 00:01:00 -to 00:02:30 -i input.mp4 -c copy output_clip.mp4
```  
This trims from 1:00 to 2:30. When using `-c copy`, FFmpeg will cut at the nearest keyframe before (or at) the specified start time【30†L144-L152】. This is very fast (essentially disk I/O only) but may not be frame-accurate unless the cut points coincide with keyframes. As one answer notes, “FFmpeg requires cutting…at I-frames. If you put `-ss` into ffmpeg, it will start from the latest i-frame before or equal to the requested time”【30†L144-L152】. If exact-frame cutting is needed, one approach is a two-pass method: copy a slightly larger segment including a keyframe, then cut the head precisely (re-encoded)【58†L299-L307】. 

For **audio**, we similarly use `-c:a copy` (assuming AAC or similar audio in an MP4). Both video and audio tracks are copied if lossless; container formats like MP4 or MKV preserve original streams. Note that some formats handle timestamp offsets differently. Often `-avoid_negative_ts make_zero` or `-fflags +genpts` is used to fix timing so that the output starts at time 0. Example:  
```
ffmpeg -ss 00:10:00 -to 00:12:00 -i input.mkv -c copy -avoid_negative_ts make_zero cut.mkv
```  
This yields a lossless segment (but only accurate to nearest keyframe)【58†L272-L275】. 

### Re-encode Mode  
If a segment’s start or end is not on keyframes, or if a different codec is desired, the app can re-encode. In this mode we omit `-c copy` and specify a codec. E.g.:  
```
ffmpeg -ss 00:15:00 -to 00:16:30 -i input.mp4 -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k output.mp4
```  
This re-encodes video with H.264 (libx264) and AAC audio. Re-encoding is slower (CPU-bound) but yields exact cuts at the requested frames. As one guide explains, “the only way…with a single ffmpeg call is to re-encode the whole video”【58†L223-L228】.  Using libx264’s CRF mode allows high quality (adjustable by CRF value) while controlling file size. If true lossless is needed (e.g. archival), one could use `-crf 0` or a truly lossless codec (FFmpeg has libx264 lossless or other codecs like FFV1), though file sizes will be large.  

Modern hardware encoders or more efficient codecs (H.265, VP9, AV1) could also be used. For example: `-c:v libx265 -crf 28` for H.265, or `-c:v libvpx-vp9 -crf 30`. These offer better compression but at slower encode times. According to performance data, H.265 (software) is roughly 2–3× slower than H.264【45†L216-L224】. Hardware codecs (NVENC, QSV) can speed up encoding at some quality cost. The UI can present these codec options with notes on speed/compatibility (see tables below).  

### Keyframes and Remux vs. Re-encode  
When cutting in “copy” mode, one must respect GOP (keyframe) boundaries. If the requested segment starts midway between keyframes, FFmpeg will simply cut at the previous I-frame, which can cause a few frames of difference【58†L272-L275】. To handle arbitrary cut points, the backend may perform a short re-encode of the first few frames until the next keyframe, or require the user to accept nearest-frame accuracy. Tools like [LosslessCut](https://github.com/mifi/lossless-cut/blob/master/cli.md) script these steps. In our app, we can either warn the user (“Segment start adjusted to keyframe at …”) or automate a two-step cut (as shown in [58] lines 294–304): first copy to nearest keyframe, then trim. This ensures exact edit while still mostly avoiding re-encoding.  

**Remuxing vs Re-encoding trade-off:** Remux (copy) is nearly instant and lossless, but limited to keyframes. Re-encoding allows exact trimming and format changes, but is time-consuming. As explained in [58]: “the two (exact cutting vs stream copy) mutually exclude each other…if you want to run ffmpeg in one line, you have to choose between either exact cutting or stream copying”【58†L272-L280】. The UI’s “Lossless” option triggers the copy method; otherwise the backend will run full encoding.  

### Performance Considerations  
FFmpeg is multi-threaded by default. Cutting many segments sequentially may take noticeable time if re-encoding. To improve UX, we can run each segment export in parallel tasks (within reason) and update a combined progress. Videos should be processed in streaming fashion (pipe output), not entirely loaded into memory. The Rust backend can use asynchronous I/O or threads so the UI remains responsive. For very large videos, it may be useful to enable hardware acceleration (e.g. using `-hwaccel cuda -c:v h264_nvenc` on NVIDIA GPUs), though license and compatibility issues should be noted.  

### File I/O, Error Handling, and Testing  
All file operations (reading input, writing output) use Rust’s `std::fs` or Tauri’s File System APIs. The app should validate paths (check readability, existence). If FFmpeg fails (non-zero exit), the Rust command returns an error with diagnostic text, and the frontend displays this to the user (e.g. “FFmpeg error: [stderr output]”). We should log operations (e.g. via `tracing`) for debugging.  

Testing should cover both logic and integration. Unit tests can verify time calculations, segment merging logic, and any pure-Rust functions. UI components can be tested with tools like React Testing Library (simulating drag events, keyboard shortcuts, etc.). Integration tests could use [tauri-driver](https://tauri.app/) to launch the app and simulate user actions. Mocking FFmpeg output or using small sample videos ensures the export logic works.  

## UI Mockups and Design Suggestions  
【54†embed_image】 *Figure: Example video editing timeline UI (unsplash image for illustration).* The timeline view should clearly show the full video duration with markers. Draggable handles (often styled as colored triangles or bars) indicate the “In” and “Out” points of each segment. Hovering or clicking a handle could snap it to the current playback time. Segment bars can be shaded differently to denote multiple segments. Below are UI ideas: use a large playhead cursor over the timeline, display timecode above the playhead, and provide a zoom control (slider or buttons) so users can zoom in for frame-level precision. The play/pause button and frame-step arrows should be easily accessible (e.g. toolbar or keyboard shortcuts). A side panel or dialog can list all defined segments (with their start/end times) for quick editing or deletion.  

【56†embed_image】 *Figure: Another possible UI layout with timeline and preview.* In the video preview area, show the current frame. Below the player, include the timeline with waveform or thumbnail previews for context. Buttons for “Set Start” and “Set End” (or “In/Out”) should be near the play controls. The export dialog could be a separate window or modal with options for directory, codec (dropdown of H.264, H.265, VP9, etc.), a checkbox for “Lossless (stream copy)”, and checkboxes for “Separate files” vs “Combine segments”. Clear feedback (status messages) during export will keep users informed.  

## Comparison Tables  

**Codec and Container Trade-offs:** The table below summarizes common video codecs and container formats. For example, MP4 + H.264 is highly compatible but not patent-free; MKV is flexible but less universal; VP9/AV1 offer better compression at much slower encode speeds【45†L207-L214】.

| Codec / Container | Compatibility          | Compression      | Encode Speed         | Licensing                       |
|-------------------|------------------------|------------------|----------------------|---------------------------------|
| **H.264 (libx264)**  | Very high (MP4/Web)   | Medium           | Fast (baseline)      | MPEG-LA patent pool【45†L207-L214】 |
| **H.265 (libx265)**  | High (newer devices)  | High (≈50% over H.264) | Slow (≈2–3× slower)【45†L216-L224】 | HEVC patent/licensing required【45†L207-L214】 |
| **VP9**            | Web-focused (Chrome/Firefox) | High (better than H.264) | Slow (≈4× slower)【45†L216-L224】 | Royalty-free【45†L207-L214】           |
| **AV1**            | Growing support       | Very high (≈30% better than VP9) | Very slow (≈10–50× slower)【45†L216-L224】 | Royalty-free【45†L207-L214】           |
| **Copy (no re-encode)** | N/A (same as source) | Identical to input | Fast (I/O-bound)      | No additional cost (keeps original stream) |
| **MP4 container**  | Broad device/browser | Depends on codec | N/A (wrapper only)    | N/A                             |
| **MKV container**  | Flexible, widely used | —                 | N/A                | N/A                             |

**Export Mode Comparison:** The table below compares export settings/modes. For “stream copy” (lossless mode), cutting is fast but limited to keyframes【30†L144-L152】【58†L272-L275】. Re-encode modes allow exact cuts at any frame but incur CPU overhead.  

| Export Option             | Quality/Codec         | Speed             | Remarks                                                         |
|---------------------------|-----------------------|-------------------|-----------------------------------------------------------------|
| **Stream Copy (`-c copy`)**  | Original (lossless)  | Very fast         | No re-encoding; output size unchanged. Cuts only on nearest keyframes【30†L144-L152】【58†L272-L275】. |
| **Re-encode (H.264)**      | High (configurable)   | Moderate          | Exact frame precision; use presets/CRF for quality vs size. Widely supported.               |
| **Re-encode (H.265/VP9/AV1)** | Higher compression    | Slow (much slower) | Best for space-saving; may need slower presets. Compatibility varies. |
| **Lossless Codec (e.g. x264 lossless)** | Perfect (no loss) | Very slow         | Files are very large; used for archival.                     |
| **Container (MP4)**       | N/A                   | N/A               | Common output; supports fast indexing.                                         |
| **Container (MKV)**       | N/A                   | N/A               | Very flexible (any codec); may need remuxing for MP4 playback devices.       |

All data above is from FFmpeg documentation and benchmarks【45†L207-L214】【30†L144-L152】【58†L272-L275】. In implementing export, the app should choose the shortest path: for lossless cuts, prefer `-c copy`; otherwise, re-encode with user-selected codec. The UI and spec ensure users understand the trade-offs (speed vs. file size vs. compatibility). 

In summary, this spec provides a comprehensive blueprint. By following Tauri’s patterns for Rust-React integration【62†L280-L284】【62†L292-L300】 and leveraging `video-rs` for media I/O【59†L314-L322】【59†L339-L347】, the app can offer precise, high-performance trimming. The design emphasizes a clean, responsive UX (with drag-and-drop timeline and keyboard shortcuts) and robust backend processing with FFmpeg. The cited sources anchor our choices to established best practices and tools.