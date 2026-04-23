import { useCallback, useRef } from "react";
import type { Segment } from "../types";
import "./Timeline.css";

interface TimelineProps {
  segments: Segment[];
  duration: number;
  currentTime: number;
  zoom: number;
  activeSegmentId: string | null;
  onSeek: (time: number) => void;
  onSegmentUpdate: (id: string, inPoint: number, outPoint: number) => void;
  onSegmentCommit: (id: string, inPoint: number, outPoint: number) => void;
  onZoomChange: (zoom: number) => void;
  /** Called on every mousemove during a handle drag with the handle's current time. */
  onHandleDrag?: (time: number) => void;
}

/**
 * Snap `time` to the nearest candidate within `thresholdSec`.
 * Candidates include the playhead and every other segment's in/out point.
 */
export function snapTime(
  time: number,
  candidates: number[],
  thresholdSec: number
): number {
  let best = time;
  let bestDelta = thresholdSec;
  for (const c of candidates) {
    const d = Math.abs(c - time);
    if (d <= bestDelta) {
      bestDelta = d;
      best = c;
    }
  }
  return best;
}

export function Timeline({
  segments,
  duration,
  currentTime,
  zoom,
  activeSegmentId,
  onSeek,
  onSegmentUpdate,
  onSegmentCommit,
  onZoomChange,
  onHandleDrag,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const toPercent = (t: number) => (t / duration) * 100;

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      onSeek(((e.clientX - rect.left) / rect.width) * duration);
    },
    [duration, onSeek]
  );

  function startHandleDrag(e: React.MouseEvent, segId: string, handle: "in" | "out") {
    e.stopPropagation();
    const seg = segments.find((s) => s.id === segId);
    if (!seg || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const frozenIn = seg.inPoint;
    const frozenOut = seg.outPoint;
    const others = segments.filter((s) => s.id !== segId);
    const leftBound = others
      .filter((s) => s.outPoint <= frozenIn)
      .reduce((m, s) => Math.max(m, s.outPoint), 0);
    const rightBound = others
      .filter((s) => s.inPoint >= frozenOut)
      .reduce((m, s) => Math.min(m, s.inPoint), duration);
    // ~6 px snap threshold in time units.
    const threshold = (6 / rect.width) * duration;
    const snapCandidates = [
      currentTime,
      ...others.flatMap((s) => [s.inPoint, s.outPoint]),
    ];
    let lastIn = frozenIn;
    let lastOut = frozenOut;
    function onMouseMove(ev: MouseEvent) {
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const raw = ratio * duration;
      const snapped = snapTime(raw, snapCandidates, threshold);
      if (handle === "in") {
        lastIn = Math.max(leftBound, Math.min(snapped, frozenOut - 0.1));
        onSegmentUpdate(segId, lastIn, frozenOut);
        onHandleDrag?.(lastIn);
      } else {
        lastOut = Math.min(rightBound, Math.max(snapped, frozenIn + 0.1));
        onSegmentUpdate(segId, frozenIn, lastOut);
        onHandleDrag?.(lastOut);
      }
    }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      onSegmentCommit(segId, lastIn, lastOut);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div className="timeline-container">
      <div
        data-testid="timeline-track"
        ref={trackRef}
        className="timeline-track"
        onClick={handleTrackClick}
        style={{ width: `${zoom * 100}%` }}
      >
        {segments.map((seg) => (
          <div
            key={seg.id}
            data-testid={`segment-bar-${seg.id}`}
            className={`segment-bar ${seg.id === activeSegmentId ? "segment-bar--active" : ""}`}
            style={{ left: `${toPercent(seg.inPoint)}%`, width: `${toPercent(seg.outPoint - seg.inPoint)}%` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="segment-handle segment-handle--in" onMouseDown={(e) => startHandleDrag(e, seg.id, "in")} />
            <div className="segment-handle segment-handle--out" onMouseDown={(e) => startHandleDrag(e, seg.id, "out")} />
          </div>
        ))}
        <div data-testid="playhead" className="playhead" style={{ left: `${duration > 0 ? toPercent(currentTime) : 0}%` }} />
      </div>
      <div className="timeline-zoom">
        <label htmlFor="zoom-slider" className="zoom-label">Zoom</label>
        <input
          id="zoom-slider"
          data-testid="zoom-slider"
          type="range"
          min="0.5"
          max="20"
          step="0.5"
          value={zoom}
          onChange={(e) => onZoomChange(parseFloat(e.target.value))}
          className="zoom-input"
        />
      </div>
    </div>
  );
}
