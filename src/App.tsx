import { useReducer, useRef, useState, useCallback, useMemo, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { historyReducer, initialHistory } from "./reducer";
import type { VideoMetadata, Segment, ToolsStatus } from "./types";
import { VideoPlayer } from "./components/VideoPlayer";
import { Controls } from "./components/Controls";
import { Timeline } from "./components/Timeline";
import { SegmentList } from "./components/SegmentList";
import { ExportDialog } from "./components/ExportDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { ToastContainer, type Toast } from "./components/Toast";
import { useKeyboard } from "./hooks/useKeyboard";
import "./App.css";

const SETTINGS_STORAGE_KEY = "video-edit.playbackSettings.v1";
const VIDEO_FILTER_EXTENSIONS = ["mp4", "mov", "mkv", "avi", "webm", "m4v"];
const VIDEO_EXTENSIONS = new Set(VIDEO_FILTER_EXTENSIONS);

interface PlaybackSettings {
  frameStepSize: number;
  secondStepSize: number;
  ffmpegDir: string;
}

function loadSettings(): PlaybackSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { frameStepSize: 5, secondStepSize: 1, ffmpegDir: "" };
    const parsed = JSON.parse(raw) as { frameStepSize?: unknown; secondStepSize?: unknown; ffmpegDir?: unknown };
    const clamp = (v: unknown, min: number, max: number, def: number): number => {
      const n = typeof v === "number" ? v : NaN;
      return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : def;
    };
    return {
      frameStepSize: clamp(parsed.frameStepSize, 1, 20, 5),
      secondStepSize: clamp(parsed.secondStepSize, 1, 10, 1),
      ffmpegDir: typeof parsed.ffmpegDir === "string" ? parsed.ffmpegDir : "",
    };
  } catch {
    return { frameStepSize: 5, secondStepSize: 1, ffmpegDir: "" };
  }
}

export default function App() {
  const [history, dispatch] = useReducer(historyReducer, initialHistory);
  const state = history.present;
  const [isPlaying, setIsPlaying] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [toolsStatus, setToolsStatus] = useState<ToolsStatus | null>(null);
  const [frameStepSize, setFrameStepSize] = useState<number>(() => loadSettings().frameStepSize);
  const [secondStepSize, setSecondStepSize] = useState<number>(() => loadSettings().secondStepSize);
  const [ffmpegDir, setFfmpegDir] = useState<string>(() => loadSettings().ffmpegDir);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [pendingIn, setPendingIn] = useState<number>(0);
  const [pendingOut, setPendingOut] = useState<number>(10);
  const shuttleIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ frameStepSize, secondStepSize, ffmpegDir }));
    } catch {
      /* best-effort */
    }
  }, [frameStepSize, secondStepSize, ffmpegDir]);

  const videoSrc = useMemo(
    () => (state.video ? convertFileSrc(state.video.path) : null),
    [state.video]
  );

  const pushToast = useCallback((message: string, kind: Toast["kind"] = "error") => {
    setToasts((ts) => [...ts, { id: crypto.randomUUID(), message, kind }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    invoke<ToolsStatus>("check_tools", { ffmpegDir })
      .then(setToolsStatus)
      .catch(() => setToolsStatus({ ffmpeg: false, ffprobe: false }));
  }, [ffmpegDir]);

  const loadVideoFromPath = useCallback(
    async (path: string) => {
      try {
        const meta = await invoke<VideoMetadata>("load_video", { path, ffmpegDir });
        dispatch({ type: "SET_VIDEO", payload: meta });
        setPendingIn(0);
        setPendingOut(meta.duration);
      } catch (err) {
        const msg = `Failed to load video: ${String(err)}`;
        console.error(msg);
        pushToast(msg);
      }
    },
    [pushToast, ffmpegDir]
  );

  async function handleOpenFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Video", extensions: VIDEO_FILTER_EXTENSIONS }],
    });
    if (typeof selected !== "string") return;
    await loadVideoFromPath(selected);
  }

  // Tauri file-drop integration. Falls back silently in test/browser environments.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        const webview = getCurrentWebview();
        unlisten = await webview.onDragDropEvent((event) => {
          if (event.payload.type !== "drop") return;
          const paths = event.payload.paths;
          if (!paths || paths.length === 0) return;
          const first = paths[0];
          const ext = first.split(".").pop()?.toLowerCase() ?? "";
          if (!VIDEO_EXTENSIONS.has(ext)) {
            pushToast(`Unsupported file type: .${ext}`);
            return;
          }
          void loadVideoFromPath(first);
        });
      } catch {
        /* not running under Tauri */
      }
    })();
    return () => {
      unlisten?.();
    };
  }, [loadVideoFromPath, pushToast]);

  const handlePlayPause = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const handleFrameStepDelta = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v || !state.video) return;
      v.currentTime = Math.max(0, Math.min(state.video.duration, v.currentTime + delta));
    },
    [state.video]
  );

  const handleKeyboardFrameStep = useCallback(
    (direction: 1 | -1) => {
      if (!state.video) return;
      handleFrameStepDelta(direction / state.video.fps);
    },
    [state.video, handleFrameStepDelta]
  );

  const handleWheelFrameStep = useCallback(
    (direction: 1 | -1, shift: boolean) => {
      if (!state.video) return;
      if (shift) {
        handleFrameStepDelta(direction * secondStepSize);
      } else {
        handleFrameStepDelta((direction * frameStepSize) / state.video.fps);
      }
    },
    [state.video, handleFrameStepDelta, frameStepSize, secondStepSize]
  );

  const handleSetIn = useCallback(() => {
    setPendingIn(state.currentTime);
  }, [state.currentTime]);

  const handleSetOut = useCallback(() => {
    setPendingOut(state.currentTime);
  }, [state.currentTime]);

  const handleAddSegment = useCallback(() => {
    if (!state.video) return;
    const duration = state.video.duration;
    const lastEnd = state.segments.reduce((m, s) => Math.max(m, s.outPoint), 0);
    const baseIn = state.segments.length > 0 ? lastEnd : pendingIn;
    const inP = Math.max(0, Math.min(baseIn, duration));
    if (inP >= duration) return;
    const outP = Math.max(inP + 0.1, Math.min(pendingOut, duration));
    const seg: Segment = { id: crypto.randomUUID(), inPoint: inP, outPoint: outP };
    dispatch({ type: "ADD_SEGMENT", payload: seg });
  }, [state.video, state.segments, pendingIn, pendingOut]);

  const handleDeleteActive = useCallback(() => {
    if (state.activeSegmentId) {
      dispatch({ type: "REMOVE_SEGMENT", payload: state.activeSegmentId });
    }
  }, [state.activeSegmentId]);

  const handleZoomIn = useCallback(() => {
    dispatch({ type: "SET_ZOOM", payload: state.zoom * 1.5 });
  }, [state.zoom]);

  const handleZoomOut = useCallback(() => {
    dispatch({ type: "SET_ZOOM", payload: state.zoom / 1.5 });
  }, [state.zoom]);

  const handleUndo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const handleRedo = useCallback(() => dispatch({ type: "REDO" }), []);

  const handleShuttle = useCallback(
    (rate: number) => {
      const v = videoRef.current;
      if (!v) return;

      // Always clear any existing reverse-step interval before branching.
      if (shuttleIntervalRef.current !== null) {
        window.clearInterval(shuttleIntervalRef.current);
        shuttleIntervalRef.current = null;
      }

      if (rate === 0 || rate === 1) {
        v.playbackRate = 1;
        return;
      }
      if (rate > 0) {
        v.playbackRate = rate;
        v.play().catch(() => {});
      } else {
        v.pause();
        shuttleIntervalRef.current = window.setInterval(() => {
          const next = v.currentTime + rate * 0.1;
          v.currentTime = Math.max(0, next);
          if (next <= 0) {
            if (shuttleIntervalRef.current !== null) {
              window.clearInterval(shuttleIntervalRef.current);
              shuttleIntervalRef.current = null;
            }
          }
        }, 100);
      }
    },
    []
  );

  useEffect(() => {
    return () => {
      if (shuttleIntervalRef.current !== null) {
        window.clearInterval(shuttleIntervalRef.current);
      }
    };
  }, []);

  useKeyboard({
    enabled: state.video !== null && !state.exportDialogOpen && !settingsOpen,
    onPlayPause: handlePlayPause,
    onFrameStep: handleKeyboardFrameStep,
    onSetIn: handleSetIn,
    onSetOut: handleSetOut,
    onAddSegment: handleAddSegment,
    onDeleteActive: handleDeleteActive,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onShuttle: handleShuttle,
  });

  const handleSegmentUpdate = useCallback(
    (id: string, inPoint: number, outPoint: number) => {
      dispatch({ type: "UPDATE_SEGMENT", payload: { id, inPoint, outPoint } });
    },
    []
  );

  const handleSegmentCommit = useCallback(
    (id: string, inPoint: number, outPoint: number) => {
      dispatch({ type: "UPDATE_SEGMENT_COMMIT", payload: { id, inPoint, outPoint } });
    },
    []
  );

  const missingTool =
    toolsStatus !== null && (!toolsStatus.ffmpeg || !toolsStatus.ffprobe);
  const missingToolNames: string[] = [];
  if (toolsStatus && !toolsStatus.ffmpeg) missingToolNames.push("ffmpeg");
  if (toolsStatus && !toolsStatus.ffprobe) missingToolNames.push("ffprobe");

  return (
    <div className="app-layout">
      <header className="app-header">
        <span className="app-title">Video Trimmer</span>
        {state.video && (
          <span className="video-meta">
            {state.video.width} × {state.video.height} &bull; {state.video.fps.toFixed(2)} fps &bull; {state.video.duration.toFixed(2)}s
          </span>
        )}
        {state.video && (
          <button
            className="export-trigger-btn"
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </button>
        )}
        {state.video && (
          <button
            className="export-trigger-btn"
            onClick={() => dispatch({ type: "TOGGLE_EXPORT_DIALOG" })}
          >
            Export
          </button>
        )}
      </header>

      {missingTool && (
        <div className="tools-banner" role="alert">
          Missing required tool{missingToolNames.length > 1 ? "s" : ""}: {missingToolNames.join(", ")}.
          {" "}Install FFmpeg and ensure it's on your PATH, or set the directory in{" "}
          <button className="tools-banner-link" onClick={() => setSettingsOpen(true)}>Settings</button>.
          <button
            className="tools-banner-retry"
            onClick={() =>
              invoke<ToolsStatus>("check_tools", { ffmpegDir })
                .then(setToolsStatus)
                .catch(() => setToolsStatus({ ffmpeg: false, ffprobe: false }))
            }
          >
            Re-check
          </button>
        </div>
      )}

      <main className="app-main">
        <section className="app-player-section">
          <VideoPlayer
            src={videoSrc}
            videoRef={videoRef}
            onTimeUpdate={(t) => dispatch({ type: "SET_CURRENT_TIME", payload: t })}
            onPlayStateChange={setIsPlaying}
            onWheelFrameStep={handleWheelFrameStep}
          />
        </section>
        <aside className="app-sidebar">
          <SegmentList
            segments={state.segments}
            activeSegmentId={state.activeSegmentId}
            onSelect={(id) => dispatch({ type: "SET_ACTIVE_SEGMENT", payload: id })}
            onDelete={(id) => dispatch({ type: "REMOVE_SEGMENT", payload: id })}
          />
        </aside>
      </main>

      <Controls
        isPlaying={isPlaying}
        currentTime={state.currentTime}
        fps={state.video?.fps ?? 30}
        hasVideo={state.video !== null}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onPlayPause={handlePlayPause}
        onOpenFile={handleOpenFile}
        onSetIn={(t) => { setPendingIn(t); }}
        onSetOut={(t) => { setPendingOut(t); }}
        pendingIn={pendingIn}
        pendingOut={pendingOut}
        onAddSegment={handleAddSegment}
        onFrameStep={handleFrameStepDelta}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      {state.video && (
        <Timeline
          segments={state.segments}
          duration={state.video.duration}
          currentTime={state.currentTime}
          zoom={state.zoom}
          activeSegmentId={state.activeSegmentId}
          onSeek={(t) => {
            if (videoRef.current) videoRef.current.currentTime = t;
          }}
          onSegmentUpdate={handleSegmentUpdate}
          onSegmentCommit={handleSegmentCommit}
          onZoomChange={(z) => dispatch({ type: "SET_ZOOM", payload: z })}
          onHandleDrag={(t) => {
            if (videoRef.current) videoRef.current.currentTime = t;
          }}
        />
      )}

      <ExportDialog
        isOpen={state.exportDialogOpen}
        segments={state.segments}
        sourcePath={state.video?.path ?? null}
        ffmpegDir={ffmpegDir}
        onClose={() => dispatch({ type: "TOGGLE_EXPORT_DIALOG" })}
        onError={(msg) => pushToast(msg)}
      />

      <SettingsDialog
        isOpen={settingsOpen}
        frameStepSize={frameStepSize}
        onChange={setFrameStepSize}
        secondStepSize={secondStepSize}
        onSecondStepChange={setSecondStepSize}
        ffmpegDir={ffmpegDir}
        onFfmpegDirChange={setFfmpegDir}
        onClose={() => setSettingsOpen(false)}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
