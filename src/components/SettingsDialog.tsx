import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./ExportDialog.css";

interface SettingsDialogProps {
  isOpen: boolean;
  frameStepSize: number;
  onChange: (value: number) => void;
  secondStepSize: number;
  onSecondStepChange: (value: number) => void;
  ffmpegDir: string;
  onFfmpegDirChange: (dir: string) => void;
  onClose: () => void;
}

export function SettingsDialog({
  isOpen,
  frameStepSize,
  onChange,
  secondStepSize,
  onSecondStepChange,
  ffmpegDir,
  onFfmpegDirChange,
  onClose,
}: SettingsDialogProps) {
  const [draftFrame, setDraftFrame] = useState(frameStepSize);
  const [draftSecond, setDraftSecond] = useState(secondStepSize);
  const [draftFfmpegDir, setDraftFfmpegDir] = useState(ffmpegDir);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<"found" | "notfound" | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraftFrame(frameStepSize);
      setDraftSecond(secondStepSize);
      setDraftFfmpegDir(ffmpegDir);
      setScanResult(null);
    }
  }, [isOpen, frameStepSize, secondStepSize, ffmpegDir]);

  if (!isOpen) return null;

  function handleSave() {
    onChange(draftFrame);
    onSecondStepChange(draftSecond);
    onFfmpegDirChange(draftFfmpegDir);
    onClose();
  }

  async function handleBrowse() {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") {
      setDraftFfmpegDir(dir);
      setScanResult(null);
    }
  }

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    try {
      const found = await invoke<string | null>("scan_ffmpeg");
      if (found) {
        setDraftFfmpegDir(found);
        setScanResult("found");
      } else {
        setScanResult("notfound");
      }
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="dialog-overlay" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="dialog-box">
        <h2 className="dialog-title">Settings</h2>

        <div className="dialog-field">
          <label htmlFor="frame-step-slider">
            Mouse wheel frame step: {draftFrame} frame{draftFrame === 1 ? "" : "s"}
          </label>
          <input
            id="frame-step-slider"
            data-testid="frame-step-slider"
            aria-label="Frame step size"
            type="range"
            min={1}
            max={20}
            step={1}
            value={draftFrame}
            onChange={(e) => setDraftFrame(parseInt(e.target.value, 10))}
            className="dialog-range"
          />
          <div className="dialog-hint">
            Wheel up = backward, wheel down = forward. Range 1–20 frames.
          </div>
        </div>

        <div className="dialog-field">
          <label htmlFor="second-step-slider">
            Shift+wheel step: {draftSecond} second{draftSecond === 1 ? "" : "s"}
          </label>
          <input
            id="second-step-slider"
            data-testid="second-step-slider"
            aria-label="Shift wheel step size"
            type="range"
            min={1}
            max={10}
            step={1}
            value={draftSecond}
            onChange={(e) => setDraftSecond(parseInt(e.target.value, 10))}
            className="dialog-range"
          />
          <div className="dialog-hint">
            Hold Shift while scrolling to jump by this many seconds. Range 1–10 s.
          </div>
        </div>

        <div className="dialog-field">
          <label htmlFor="ffmpeg-dir-input">FFmpeg directory</label>
          <div className="dialog-row">
            <input
              id="ffmpeg-dir-input"
              data-testid="ffmpeg-dir-input"
              aria-label="FFmpeg directory"
              type="text"
              value={draftFfmpegDir}
              onChange={(e) => { setDraftFfmpegDir(e.target.value); setScanResult(null); }}
              placeholder="Leave empty to use system PATH"
              className="dialog-input"
            />
            <button
              aria-label="Browse for FFmpeg directory"
              onClick={handleBrowse}
              className="dialog-btn"
            >
              Browse…
            </button>
          </div>
          <div className="dialog-row" style={{ marginTop: "6px", gap: "8px", alignItems: "center" }}>
            <button
              aria-label="Scan for FFmpeg"
              onClick={handleScan}
              disabled={scanning}
              className="dialog-btn"
            >
              {scanning ? "Scanning…" : "Scan"}
            </button>
            {scanResult === "found" && (
              <span className="dialog-hint" style={{ color: "var(--color-success, #3a7)" }}>
                FFmpeg found.
              </span>
            )}
            {scanResult === "notfound" && (
              <span className="dialog-hint" style={{ color: "var(--color-error, #c44)" }}>
                Not found in common locations.
              </span>
            )}
          </div>
          <div className="dialog-hint">
            Directory containing the <code>ffmpeg</code> and <code>ffprobe</code> binaries.
            Leave empty to use the system PATH.
          </div>
        </div>

        <div className="dialog-actions">
          <button
            aria-label="Cancel"
            onClick={onClose}
            className="dialog-btn dialog-btn--secondary"
          >
            Cancel
          </button>
          <button
            aria-label="Save"
            onClick={handleSave}
            className="dialog-btn dialog-btn--primary"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
