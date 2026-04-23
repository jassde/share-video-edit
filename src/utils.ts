/**
 * Format a duration in seconds to HH:MM:SS.mmm (or M:SS.mmm when < 1 hour).
 * Used by Controls and SegmentList.
 */
export function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const secs = (s % 60).toFixed(3).padStart(6, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${secs}`;
  return `${m}:${secs}`;
}

/**
 * Return the 0-based frame index for the given playback time and frame rate.
 */
export function frameNumber(time: number, fps: number): number {
  return fps > 0 ? Math.floor(time * fps) : 0;
}
