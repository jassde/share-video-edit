import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { Controls } from "../components/Controls";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn().mockResolvedValue("/v.mp4") }));

// currentTime: 5.0 s at 30 fps → frame 150, display "0:05.000"
const defaults = {
  isPlaying: false, currentTime: 5.0, fps: 30, hasVideo: true,
  canUndo: false, canRedo: false,
  onPlayPause: vi.fn(), onOpenFile: vi.fn(), onSetIn: vi.fn(),
  onSetOut: vi.fn(), pendingIn: 0, pendingOut: 10,
  onAddSegment: vi.fn(), onFrameStep: vi.fn(),
  onUndo: vi.fn(), onRedo: vi.fn(),
};

describe("Controls", () => {
  it("renders Open File button always", () => {
    render(<Controls {...defaults} hasVideo={false} />);
    expect(screen.getByRole("button", { name: /open/i })).toBeInTheDocument();
  });
  it("shows Play when not playing", () => {
    render(<Controls {...defaults} isPlaying={false} />);
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
  });
  it("shows Pause when playing", () => {
    render(<Controls {...defaults} isPlaying={true} />);
    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
  });
  it("calls onPlayPause when Play clicked", async () => {
    const onPlayPause = vi.fn();
    render(<Controls {...defaults} onPlayPause={onPlayPause} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /play/i }));
    expect(onPlayPause).toHaveBeenCalledTimes(1);
  });
  it("calls onSetIn with currentTime", async () => {
    const onSetIn = vi.fn();
    render(<Controls {...defaults} onSetIn={onSetIn} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /set in/i }));
    expect(onSetIn).toHaveBeenCalledWith(5.0);
  });
  it("calls onSetOut with currentTime", async () => {
    const onSetOut = vi.fn();
    render(<Controls {...defaults} onSetOut={onSetOut} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /set out/i }));
    expect(onSetOut).toHaveBeenCalledWith(5.0);
  });
  it("calls onFrameStep(-1/fps) on Prev Frame", async () => {
    const onFrameStep = vi.fn();
    render(<Controls {...defaults} onFrameStep={onFrameStep} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /prev frame/i }));
    expect(onFrameStep).toHaveBeenCalledWith(-(1 / 30));
  });
  it("calls onFrameStep(+1/fps) on Next Frame", async () => {
    const onFrameStep = vi.fn();
    render(<Controls {...defaults} onFrameStep={onFrameStep} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /next frame/i }));
    expect(onFrameStep).toHaveBeenCalledWith(1 / 30);
  });
  it("disables video controls when hasVideo is false", () => {
    render(<Controls {...defaults} hasVideo={false} />);
    expect(screen.getByRole("button", { name: /play/i })).toBeDisabled();
  });

  // --- Timecode display ---
  it("shows formatted timecode for currentTime", () => {
    render(<Controls {...defaults} currentTime={5.0} fps={30} />);
    expect(screen.getByTestId("timecode").textContent).toContain("0:05.000");
  });
  it("shows frame number for currentTime", () => {
    // 5.0 s × 30 fps = frame 150
    render(<Controls {...defaults} currentTime={5.0} fps={30} />);
    expect(screen.getByTestId("frame-number").textContent).toContain("150");
  });
  it("timecode displays hours when >= 3600 s", () => {
    render(<Controls {...defaults} currentTime={3665.5} fps={25} />);
    expect(screen.getByTestId("timecode").textContent).toMatch(/1:01:05/);
  });
  it("timecode updates when currentTime prop changes", () => {
    const { rerender } = render(<Controls {...defaults} currentTime={0} fps={30} />);
    expect(screen.getByTestId("timecode").textContent).toContain("0:00.000");
    rerender(<Controls {...defaults} currentTime={90.0} fps={30} />);
    expect(screen.getByTestId("timecode").textContent).toContain("1:30.000");
  });
});
