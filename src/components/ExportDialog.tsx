import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type { Segment, Preset, ExportTemplate } from "../types";
import "./ExportDialog.css";

interface ExportProgressEvent {
  current: number;
  total: number;
  percent: number;
  segmentPercent?: number;
}

interface ExportDialogProps {
  isOpen: boolean;
  segments: Segment[];
  sourcePath: string | null;
  ffmpegDir: string;
  onClose: () => void;
  onError?: (message: string) => void;
}

const STORAGE_KEY = "video-edit.exportSettings.v1";
const PRESETS: Preset[] = ["ultrafast", "fast", "medium", "slow", "veryslow"];

/** Built-in export templates. Selecting one fills codec/crf/preset/lossless. */
const EXPORT_TEMPLATES: ExportTemplate[] = [
  { label: "YouTube (H.264 High Quality)",  codec: "h264", crf: 18, preset: "medium", lossless: false, note: "CRF 18 — great for 1080p/4K uploads." },
  { label: "YouTube (H.265 Efficient)",     codec: "h265", crf: 20, preset: "medium", lossless: false, note: "Half the file size of H.264 at similar quality." },
  { label: "Web / Social (Balanced)",       codec: "h264", crf: 23, preset: "fast",   lossless: false, note: "Good balance of size and quality for sharing." },
  { label: "Archive (Lossless stream copy)",codec: "h264", crf: 23, preset: "medium", lossless: true,  note: "No re-encode — fastest export, largest file." },
  { label: "VP9 Web Video",                 codec: "vp9",  crf: 33, preset: "medium", lossless: false, note: "Open format for browser embedding." },
  { label: "AV1 (Efficient, slow encode)",  codec: "av1",  crf: 30, preset: "medium", lossless: false, note: "Best compression ratio; slowest to encode." },
];

/** Human-readable label for a GPU encoder name. */
function gpuEncoderLabel(enc: string): string {
  const MAP: Record<string, string> = {
    h264_nvenc:         "H.264 — NVIDIA GPU",
    hevc_nvenc:         "H.265 — NVIDIA GPU",
    av1_nvenc:          "AV1  — NVIDIA GPU (RTX 40+)",
    h264_qsv:           "H.264 — Intel QSV",
    hevc_qsv:           "H.265 — Intel QSV",
    h264_amf:           "H.264 — AMD GPU",
    hevc_amf:           "H.265 — AMD GPU",
    h264_videotoolbox:  "H.264 — Apple VideoToolbox",
    hevc_videotoolbox:  "H.265 — Apple VideoToolbox",
  };
  return MAP[enc] ?? enc;
}

interface StoredSettings {
  outputDir?: string;
  codec?: string;
  lossless?: boolean;
  crf?: number;
  preset?: Preset;
  concat?: boolean;
}

function loadStored(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSettings) : {};
  } catch {
    return {};
  }
}

function saveStored(settings: StoredSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable — best-effort only */
  }
}

export function ExportDialog({ isOpen, segments, sourcePath, ffmpegDir, onClose, onError }: ExportDialogProps) {
  const stored = useRef<StoredSettings>(loadStored());
  const [outputDir, setOutputDir] = useState(stored.current.outputDir ?? "");
  const [codec, setCodec] = useState<string>(stored.current.codec ?? "h264");
  const [lossless, setLossless] = useState(stored.current.lossless ?? false);
  const [crf, setCrf] = useState<number>(stored.current.crf ?? 23);
  const [preset, setPreset] = useState<Preset>(stored.current.preset ?? "medium");
  const [concat, setConcat] = useState<boolean>(stored.current.concat ?? false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [segmentPercent, setSegmentPercent] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [outputPaths, setOutputPaths] = useState<string[]>([]);
  const [gpuEncoders, setGpuEncoders] = useState<string[]>([]);
  const [templateNote, setTemplateNote] = useState<string | null>(null);

  // Detect GPU encoders and reset transient state when dialog opens.
  useEffect(() => {
    if (!isOpen) {
      setProgress(0);
      setSegmentPercent(0);
      setCurrentIndex(0);
      setError(null);
      setOutputPaths([]);
      setExporting(false);
      setTemplateNote(null);
      return;
    }
    invoke<string[]>("detect_encoders", { ffmpegDir })
      .then((result) => setGpuEncoders(Array.isArray(result) ? result : []))
      .catch(() => setGpuEncoders([]));
  }, [isOpen]);

  useEffect(() => {
    saveStored({ outputDir, codec, lossless, crf, preset, concat });
  }, [outputDir, codec, lossless, crf, preset, concat]);

  const unlistenRef = useRef<(() => void) | null>(null);
  useEffect(() => () => unlistenRef.current?.(), []);

  function applyTemplate(tpl: ExportTemplate) {
    setCodec(tpl.codec);
    setLossless(tpl.lossless);
    setCrf(tpl.crf);
    setPreset(tpl.preset);
    setTemplateNote(tpl.note);
  }

  async function handleBrowse() {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") setOutputDir(dir);
  }

  async function handleExport() {
    if (!sourcePath || !outputDir) return;
    setExporting(true);
    setError(null);
    setProgress(0);
    setSegmentPercent(0);
    setCurrentIndex(0);
    const unlisten = await listen<ExportProgressEvent>("export-progress", (e) => {
      setProgress(e.payload.percent);
      setSegmentPercent(e.payload.segmentPercent ?? 0);
      setCurrentIndex(e.payload.current);
    });
    unlistenRef.current = unlisten;
    try {
      const paths = await invoke<string[]>("export_segments", {
        source: sourcePath,
        segments,
        options: { outputDir, codec, lossless, crf, preset, concat },
        ffmpegDir,
      });
      setOutputPaths(paths);
      setProgress(100);
    } catch (err) {
      const message = String(err);
      setError(message);
      onError?.(message);
    } finally {
      setExporting(false);
      unlisten();
      unlistenRef.current = null;
    }
  }

  async function handleCancel() {
    if (exporting) {
      await invoke("cancel_export").catch(() => {});
    }
    onClose();
  }

  if (!isOpen) return null;

  const isGpu = codec.includes("_");
  const isAv1 = codec === "av1";
  const showPreset = !lossless && !isGpu && !isAv1;

  return (
    <div className="dialog-overlay" role="dialog" aria-modal="true" aria-label="Export">
      <div className="dialog-box">
        <h2 className="dialog-title">Export Segments</h2>

        {/* Template picker */}
        <div className="dialog-field">
          <label htmlFor="template-select">Template</label>
          <select
            id="template-select"
            aria-label="Export template"
            defaultValue=""
            onChange={(e) => {
              const tpl = EXPORT_TEMPLATES.find((t) => t.label === e.target.value);
              if (tpl) applyTemplate(tpl);
            }}
            disabled={exporting}
            className="dialog-select"
          >
            <option value="">— Custom —</option>
            {EXPORT_TEMPLATES.map((t) => (
              <option key={t.label} value={t.label}>{t.label}</option>
            ))}
          </select>
          {templateNote && <div className="dialog-hint">{templateNote}</div>}
        </div>

        {/* Output folder */}
        <div className="dialog-field">
          <label htmlFor="output-dir">Output Folder</label>
          <div className="dialog-row">
            <input
              id="output-dir"
              type="text"
              value={outputDir}
              readOnly
              placeholder="Select output folder..."
              className="dialog-input"
            />
            <button aria-label="Browse" onClick={handleBrowse} disabled={exporting} className="dialog-btn">
              Browse
            </button>
          </div>
        </div>

        {/* Encoder — software + detected GPU */}
        <div className="dialog-field">
          <label htmlFor="codec-select">Encoder</label>
          <select
            id="codec-select"
            aria-label="Codec"
            value={codec}
            onChange={(e) => { setCodec(e.target.value); setTemplateNote(null); }}
            disabled={exporting}
            className="dialog-select"
          >
            <optgroup label="Software">
              <option value="h264">H.264 (libx264)</option>
              <option value="h265">H.265 (libx265)</option>
              <option value="vp9">VP9 (libvpx-vp9)</option>
              <option value="av1">AV1 (libaom-av1)</option>
            </optgroup>
            {gpuEncoders.length > 0 && (
              <optgroup label="GPU Accelerated">
                {gpuEncoders.map((enc) => (
                  <option key={enc} value={enc}>{gpuEncoderLabel(enc)}</option>
                ))}
              </optgroup>
            )}
          </select>
          {isGpu && (
            <div className="dialog-hint">
              GPU encoders are faster but quality flags differ from software encoders.
              CRF value maps to the encoder's native quality parameter.
            </div>
          )}
        </div>

        {/* Lossless */}
        <div className="dialog-field dialog-field--inline">
          <label htmlFor="lossless-cb">Lossless (stream copy)</label>
          <input
            id="lossless-cb"
            aria-label="Lossless"
            type="checkbox"
            checked={lossless}
            onChange={(e) => setLossless(e.target.checked)}
            disabled={exporting}
          />
        </div>

        {lossless && (
          <div className="dialog-hint dialog-hint--warn">
            Stream copy mode: cuts snap to the nearest keyframe. Output may
            not be frame-accurate.
          </div>
        )}

        {!lossless && (
          <>
            <div className="dialog-field">
              <label htmlFor="crf-slider">Quality ({isGpu ? "GPU quality" : "CRF"}: {crf})</label>
              <input
                id="crf-slider"
                aria-label="CRF"
                type="range"
                min={0}
                max={51}
                step={1}
                value={crf}
                onChange={(e) => setCrf(parseInt(e.target.value, 10))}
                disabled={exporting}
                className="dialog-range"
              />
              <div className="dialog-hint">
                {isGpu
                  ? "Lower = higher quality. Range varies by GPU encoder (0–51)."
                  : "Lower = higher quality, larger file (18–28 is typical)."}
              </div>
            </div>

            {showPreset && (
              <div className="dialog-field">
                <label htmlFor="preset-select">Speed Preset</label>
                <select
                  id="preset-select"
                  aria-label="Preset"
                  value={preset}
                  onChange={(e) => setPreset(e.target.value as Preset)}
                  disabled={exporting}
                  className="dialog-select"
                >
                  {PRESETS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {/* Concat (only relevant with multiple segments) */}
        {segments.length > 1 && (
          <div className="dialog-field dialog-field--inline">
            <label htmlFor="concat-cb">Concat into single file</label>
            <input
              id="concat-cb"
              aria-label="Concat"
              type="checkbox"
              checked={concat}
              onChange={(e) => setConcat(e.target.checked)}
              disabled={exporting}
            />
          </div>
        )}

        {exporting && (
          <div className="dialog-progress">
            <div
              className="dialog-progress-bar"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
            <span className="dialog-progress-label">
              {Math.round(progress)}% — segment {currentIndex}/{segments.length}
              {segmentPercent > 0 && ` (${Math.round(segmentPercent)}%)`}
            </span>
          </div>
        )}

        {error && <p className="dialog-error">{error}</p>}
        {outputPaths.length > 0 && (
          <ul className="dialog-results">
            {outputPaths.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}

        <div className="dialog-actions">
          <button
            aria-label={exporting ? "Cancel Export" : "Cancel"}
            onClick={handleCancel}
            className="dialog-btn dialog-btn--secondary"
          >
            {exporting ? "Cancel Export" : "Cancel"}
          </button>
          <button
            aria-label="Export"
            onClick={handleExport}
            disabled={exporting || !outputDir || segments.length === 0}
            className="dialog-btn dialog-btn--primary"
          >
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
