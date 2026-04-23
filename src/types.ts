export type Codec = "h264" | "h265" | "vp9" | "av1";
export type Preset = "ultrafast" | "fast" | "medium" | "slow" | "veryslow";

/** A built-in template that pre-fills ExportDialog quality settings. */
export interface ExportTemplate {
  /** Display label shown in the dropdown. */
  label: string;
  /** Logical codec identifier (Codec) or GPU encoder name. */
  codec: string;
  lossless: boolean;
  crf: number;
  preset: Preset;
  /** Short hint shown below the dropdown. */
  note: string;
}

export interface ToolsStatus {
  ffmpeg: boolean;
  ffprobe: boolean;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  path: string;
}

export interface Segment {
  id: string;
  inPoint: number;
  outPoint: number;
}

export interface ExportOptions {
  outputDir: string;
  /** Logical codec name ("h264", "h265", "vp9", "av1") or GPU encoder name (e.g. "h264_nvenc"). */
  codec: string;
  lossless: boolean;
  crf: number;
  preset: Preset;
  concat: boolean;
}

export interface AppState {
  video: VideoMetadata | null;
  currentTime: number;
  segments: Segment[];
  activeSegmentId: string | null;
  zoom: number;
  exportDialogOpen: boolean;
}
