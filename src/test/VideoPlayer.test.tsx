import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { VideoPlayer } from "../components/VideoPlayer";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("VideoPlayer", () => {
  it("renders a video element", () => {
    render(<VideoPlayer src={null} onTimeUpdate={vi.fn()} videoRef={{ current: null }} />);
    expect(screen.getByTestId("video-player")).toBeInTheDocument();
  });
  it("shows placeholder when src is null", () => {
    render(<VideoPlayer src={null} onTimeUpdate={vi.fn()} videoRef={{ current: null }} />);
    expect(screen.getByText(/open a video/i)).toBeInTheDocument();
  });
  it("sets src attribute when provided", () => {
    render(<VideoPlayer src="file:///video.mp4" onTimeUpdate={vi.fn()} videoRef={{ current: null }} />);
    const video = screen.getByTestId("video-player") as HTMLVideoElement;
    expect(video.src).toContain("video.mp4");
  });
  it("calls onTimeUpdate on timeupdate event", () => {
    const onTimeUpdate = vi.fn();
    render(<VideoPlayer src="file:///v.mp4" onTimeUpdate={onTimeUpdate} videoRef={{ current: null }} />);
    const video = screen.getByTestId("video-player") as HTMLVideoElement;
    Object.defineProperty(video, "currentTime", { value: 5.5, writable: true });
    video.dispatchEvent(new Event("timeupdate"));
    expect(onTimeUpdate).toHaveBeenCalledWith(5.5);
  });
});
