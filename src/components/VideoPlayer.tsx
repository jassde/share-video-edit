import { RefObject, useEffect } from "react";
import "./VideoPlayer.css";

interface VideoPlayerProps {
  src: string | null;
  onTimeUpdate: (time: number) => void;
  videoRef: RefObject<HTMLVideoElement>;
  onPlayStateChange?: (playing: boolean) => void;
  onWheelFrameStep?: (direction: 1 | -1, shift: boolean) => void;
}

export function VideoPlayer({
  src,
  onTimeUpdate,
  videoRef,
  onPlayStateChange,
  onWheelFrameStep,
}: VideoPlayerProps) {
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !onWheelFrameStep) return;
    const onStep = onWheelFrameStep;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      onStep(e.deltaY > 0 ? 1 : -1, e.shiftKey);
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [videoRef, onWheelFrameStep]);

  return (
    <div className="video-player-wrapper">
      {!src && (
        <div className="video-placeholder">
          <p>Open a video file to get started</p>
        </div>
      )}
      <video
        data-testid="video-player"
        ref={videoRef}
        src={src ?? undefined}
        className="video-element"
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
        onPlay={() => onPlayStateChange?.(true)}
        onPause={() => onPlayStateChange?.(false)}
        onEnded={() => onPlayStateChange?.(false)}
        preload="metadata"
      />
    </div>
  );
}
