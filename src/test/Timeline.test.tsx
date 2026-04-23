import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { Timeline, snapTime } from "../components/Timeline";
import type { Segment } from "../types";

const SEGS: Segment[] = [{ id: "s1", inPoint: 5, outPoint: 20 }, { id: "s2", inPoint: 30, outPoint: 45 }];
const defaults = {
  segments: SEGS, duration: 60, currentTime: 10, zoom: 1, activeSegmentId: "s1",
  onSeek: vi.fn(), onSegmentUpdate: vi.fn(), onSegmentCommit: vi.fn(), onZoomChange: vi.fn()
};

describe("Timeline", () => {
  it("renders the timeline track", () => {
    render(<Timeline {...defaults} />);
    expect(screen.getByTestId("timeline-track")).toBeInTheDocument();
  });
  it("renders one bar per segment", () => {
    render(<Timeline {...defaults} />);
    expect(screen.getAllByTestId(/segment-bar/)).toHaveLength(2);
  });
  it("renders zoom slider", () => {
    render(<Timeline {...defaults} />);
    expect(screen.getByTestId("zoom-slider")).toBeInTheDocument();
  });
  it("calls onZoomChange when slider changes", () => {
    const onZoomChange = vi.fn();
    render(<Timeline {...defaults} onZoomChange={onZoomChange} />);
    fireEvent.change(screen.getByTestId("zoom-slider"), { target: { value: "3" } });
    expect(onZoomChange).toHaveBeenCalledWith(3);
  });
  it("renders playhead", () => {
    render(<Timeline {...defaults} />);
    expect(screen.getByTestId("playhead")).toBeInTheDocument();
  });
  it("calls onSeek when track clicked", () => {
    const onSeek = vi.fn();
    render(<Timeline {...defaults} onSeek={onSeek} />);
    const track = screen.getByTestId("timeline-track");
    Object.defineProperty(track, "getBoundingClientRect", { value: () => ({ left: 0, width: 600 }) });
    fireEvent.click(track, { clientX: 300 });
    expect(onSeek).toHaveBeenCalledWith(30);
  });

  it("calls onHandleDrag with the current handle time on each mousemove", () => {
    const onHandleDrag = vi.fn();
    render(<Timeline {...defaults} onHandleDrag={onHandleDrag} />);
    const track = screen.getByTestId("timeline-track");
    // Give the track a known bounding box so time calculation is predictable.
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 600 }),
      configurable: true,
    });
    const inHandle = screen
      .getByTestId(`segment-bar-${SEGS[0].id}`)
      .querySelector(".segment-handle--in") as Element;
    fireEvent.mouseDown(inHandle, { clientX: 50 });
    fireEvent.mouseMove(window, { clientX: 60 });
    expect(onHandleDrag).toHaveBeenCalled();
    const t = onHandleDrag.mock.calls[0][0] as number;
    expect(typeof t).toBe("number");
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(defaults.duration);
  });

  it("does not throw when onHandleDrag is omitted", () => {
    // Default props don't include onHandleDrag — dragging should not error.
    render(<Timeline {...defaults} />);
    const inHandle = screen
      .getByTestId(`segment-bar-${SEGS[0].id}`)
      .querySelector(".segment-handle--in") as Element;
    expect(() => {
      fireEvent.mouseDown(inHandle, { clientX: 50 });
      fireEvent.mouseMove(window, { clientX: 60 });
    }).not.toThrow();
  });
});

describe("snapTime", () => {
  it("returns the raw time when no candidate is within threshold", () => {
    expect(snapTime(10, [5, 20], 0.5)).toBe(10);
  });
  it("snaps to the nearest candidate within threshold", () => {
    expect(snapTime(10.2, [10, 15], 0.5)).toBe(10);
  });
  it("picks the closest of multiple candidates", () => {
    expect(snapTime(10.4, [10, 10.5, 20], 1)).toBe(10.5);
  });
  it("handles empty candidate list", () => {
    expect(snapTime(3, [], 1)).toBe(3);
  });
});
