import { useEffect } from "react";

export interface KeyboardHandlers {
  onPlayPause: () => void;
  onFrameStep: (direction: 1 | -1) => void;
  onSetIn: () => void;
  onSetOut: () => void;
  onAddSegment: () => void;
  onDeleteActive: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onShuttle: (rate: number) => void;
}

interface UseKeyboardOptions extends KeyboardHandlers {
  enabled: boolean;
}

export function useKeyboard(opts: UseKeyboardOptions) {
  const {
    enabled,
    onPlayPause,
    onFrameStep,
    onSetIn,
    onSetOut,
    onAddSegment,
    onDeleteActive,
    onZoomIn,
    onZoomOut,
    onUndo,
    onRedo,
    onShuttle,
  } = opts;

  useEffect(() => {
    if (!enabled) return;
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const editable = (e.target as HTMLElement)?.isContentEditable;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || editable) return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        onRedo();
        return;
      }

      switch (e.key) {
        case " ":
        case "k":
        case "K":
          e.preventDefault();
          onPlayPause();
          return;
        case "ArrowLeft":
          e.preventDefault();
          onFrameStep(-1);
          return;
        case "ArrowRight":
          e.preventDefault();
          onFrameStep(1);
          return;
        case "j":
        case "J":
          e.preventDefault();
          onShuttle(-2);
          return;
        case "l":
        case "L":
          e.preventDefault();
          onShuttle(2);
          return;
        case "i":
        case "I":
          e.preventDefault();
          onSetIn();
          return;
        case "o":
        case "O":
          e.preventDefault();
          onSetOut();
          return;
        case "Enter":
          if (!e.shiftKey && !mod) {
            e.preventDefault();
            onAddSegment();
          }
          return;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          onDeleteActive();
          return;
        case "+":
        case "=":
          e.preventDefault();
          onZoomIn();
          return;
        case "-":
        case "_":
          e.preventDefault();
          onZoomOut();
          return;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    enabled,
    onPlayPause,
    onFrameStep,
    onSetIn,
    onSetOut,
    onAddSegment,
    onDeleteActive,
    onZoomIn,
    onZoomOut,
    onUndo,
    onRedo,
    onShuttle,
  ]);
}
