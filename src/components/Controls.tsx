import { formatTime, frameNumber } from "../utils";
import "./Controls.css";

interface ControlsProps {
  isPlaying: boolean;
  currentTime: number;
  fps: number;
  hasVideo: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onPlayPause: () => void;
  onOpenFile: () => void;
  onSetIn: (time: number) => void;
  onSetOut: (time: number) => void;
  pendingIn: number;
  pendingOut: number;
  onAddSegment: () => void;
  onFrameStep: (delta: number) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function Controls({
  isPlaying,
  currentTime,
  fps,
  hasVideo,
  canUndo,
  canRedo,
  onPlayPause,
  onOpenFile,
  onSetIn,
  onSetOut,
  pendingIn,
  pendingOut,
  onAddSegment,
  onFrameStep,
  onUndo,
  onRedo,
}: ControlsProps) {
  const frameDelta = fps > 0 ? 1 / fps : 1 / 30;
  return (
    <div className="controls-bar">
      <button onClick={onOpenFile} className="controls-btn controls-btn--open">Open File</button>
      <span className="controls-timecode" aria-label="Current time" data-testid="timecode">
        {formatTime(currentTime)}
        {fps > 0 && (
          <span className="controls-frame" data-testid="frame-number">
            {" · "}{frameNumber(currentTime, fps)}
          </span>
        )}
      </span>
      <div className="controls-group">
        <button aria-label="Prev Frame" onClick={() => onFrameStep(-frameDelta)} disabled={!hasVideo} className="controls-btn">&#9664;</button>
        <button aria-label={isPlaying ? "Pause" : "Play"} onClick={onPlayPause} disabled={!hasVideo} className="controls-btn controls-btn--play">{isPlaying ? "Pause" : "Play"}</button>
        <button aria-label="Next Frame" onClick={() => onFrameStep(frameDelta)} disabled={!hasVideo} className="controls-btn">&#9654;</button>
      </div>
      <div className="controls-group">
        <div className="controls-point-group">
          <button aria-label="Set In" onClick={() => onSetIn(currentTime)} disabled={!hasVideo} className="controls-btn">Set In</button>
          <span className="controls-point-label" data-testid="in-point-label">{formatTime(pendingIn)}</span>
        </div>
        <div className="controls-point-group">
          <button aria-label="Set Out" onClick={() => onSetOut(currentTime)} disabled={!hasVideo} className="controls-btn">Set Out</button>
          <span className="controls-point-label" data-testid="out-point-label">{formatTime(pendingOut)}</span>
        </div>
        <button aria-label="Add Segment" onClick={onAddSegment} disabled={!hasVideo} className="controls-btn controls-btn--add">+ Segment</button>
      </div>
      <div className="controls-group">
        <button aria-label="Undo" onClick={onUndo} disabled={!canUndo} className="controls-btn">Undo</button>
        <button aria-label="Redo" onClick={onRedo} disabled={!canRedo} className="controls-btn">Redo</button>
      </div>
    </div>
  );
}
