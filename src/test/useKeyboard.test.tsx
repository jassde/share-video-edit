import { renderHook } from "@testing-library/react";
import { vi } from "vitest";
import { useKeyboard, type KeyboardHandlers } from "../hooks/useKeyboard";

const fire = (key: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));

function makeHandlers(overrides: Partial<KeyboardHandlers> = {}): KeyboardHandlers {
  return {
    onPlayPause: vi.fn(),
    onFrameStep: vi.fn(),
    onSetIn: vi.fn(),
    onSetOut: vi.fn(),
    onAddSegment: vi.fn(),
    onDeleteActive: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onShuttle: vi.fn(),
    ...overrides,
  };
}

describe("useKeyboard", () => {
  it("calls onPlayPause on Space", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboard({ ...handlers, enabled: true }));
    fire(" ");
    expect(handlers.onPlayPause).toHaveBeenCalledTimes(1);
  });
  it("calls onPlayPause on K", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboard({ ...handlers, enabled: true }));
    fire("k");
    expect(handlers.onPlayPause).toHaveBeenCalledTimes(1);
  });
  it("calls onFrameStep(-1) on ArrowLeft", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboard({ ...handlers, enabled: true }));
    fire("ArrowLeft");
    expect(handlers.onFrameStep).toHaveBeenCalledWith(-1);
  });
  it("calls onFrameStep(1) on ArrowRight", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboard({ ...handlers, enabled: true }));
    fire("ArrowRight");
    expect(handlers.onFrameStep).toHaveBeenCalledWith(1);
  });
  it("calls onShuttle(-2) on J", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboard({ ...handlers, enabled: true }));
    fire("j");
    expect(handlers.onShuttle).toHaveBeenCalledWith(-2);
  });
  it("calls onShuttle(2) on L", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboard({ ...handlers, enabled: true }));
    fire("l");
    expect(handlers.onShuttle).toHaveBeenCalledWith(2);
  });
  it("calls onSetIn on I", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboard({ ...handlers, enabled: true }));
    fire("i");
    expect(handlers.onSetIn).toHaveBeenCalledTimes(1);
  });
  it("calls onSetOut on O", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboard({ ...handlers, enabled: true }));
    fire("o");
    expect(handlers.onSetOut).toHaveBeenCalledTimes(1);
  });
  it("calls onDeleteActive on Delete", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboard({ ...handlers, enabled: true }));
    fire("Delete");
    expect(handlers.onDeleteActive).toHaveBeenCalledTimes(1);
  });
  it("calls onZoomIn on + and onZoomOut on -", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboard({ ...handlers, enabled: true }));
    fire("+");
    fire("-");
    expect(handlers.onZoomIn).toHaveBeenCalledTimes(1);
    expect(handlers.onZoomOut).toHaveBeenCalledTimes(1);
  });
  it("calls onUndo on Ctrl+Z and onRedo on Ctrl+Shift+Z", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboard({ ...handlers, enabled: true }));
    fire("z", { ctrlKey: true });
    fire("z", { ctrlKey: true, shiftKey: true });
    expect(handlers.onUndo).toHaveBeenCalledTimes(1);
    expect(handlers.onRedo).toHaveBeenCalledTimes(1);
  });
  it("does not fire when enabled is false", () => {
    const handlers = makeHandlers();
    renderHook(() => useKeyboard({ ...handlers, enabled: false }));
    fire(" ");
    expect(handlers.onPlayPause).not.toHaveBeenCalled();
  });
  it("removes listener on unmount", () => {
    const handlers = makeHandlers();
    const { unmount } = renderHook(() => useKeyboard({ ...handlers, enabled: true }));
    unmount();
    fire(" ");
    expect(handlers.onPlayPause).not.toHaveBeenCalled();
  });
});
