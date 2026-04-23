import type { Segment } from "../types";
import { formatTime } from "../utils";
import "./SegmentList.css";

interface SegmentListProps {
  segments: Segment[];
  activeSegmentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function SegmentList({ segments, activeSegmentId, onSelect, onDelete }: SegmentListProps) {
  if (segments.length === 0)
    return <div className="segment-list segment-list--empty"><p>No segments yet. Use Set In / Set Out then + Segment.</p></div>;
  return (
    <ul className="segment-list">
      {segments.map((seg, i) => (
        <li
          key={seg.id}
          data-testid={`segment-item-${seg.id}`}
          className={`segment-item ${seg.id === activeSegmentId ? "segment-item--active" : ""}`}
          onClick={() => onSelect(seg.id)}
        >
          <span className="segment-index">#{i + 1}</span>
          <span className="segment-times">{formatTime(seg.inPoint)} – {formatTime(seg.outPoint)}</span>
          <span className="segment-duration">({(seg.outPoint - seg.inPoint).toFixed(2)}s)</span>
          <button
            aria-label={`Delete segment ${i + 1}`}
            onClick={(e) => { e.stopPropagation(); onDelete(seg.id); }}
            className="segment-delete-btn"
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}
