import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import App from "../App";

const mockMeta = vi.hoisted(() => ({ duration: 60, width: 1280, height: 720, fps: 30, path: "/video/test.mp4" }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === "check_tools") return Promise.resolve({ ffmpeg: true, ffprobe: true });
    if (cmd === "load_video") return Promise.resolve(mockMeta);
    return Promise.resolve(undefined);
  }),
  convertFileSrc: vi.fn().mockReturnValue("asset://localhost/video.mp4"),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue("/video/test.mp4"),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn().mockResolvedValue(() => {}),
  }),
}));

describe("App integration", () => {
  it("renders without crashing", () => {
    render(<App />);
    expect(screen.getByTestId("video-player")).toBeInTheDocument();
  });
  it("shows Open File button", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /open/i })).toBeInTheDocument();
  });
  it("loads video metadata after Open File clicked", async () => {
    render(<App />);
    await userEvent.setup().click(screen.getByRole("button", { name: /open/i }));
    await waitFor(() => expect(screen.getByText(/1280/)).toBeInTheDocument());
  });
  it("shows export dialog after Export clicked", async () => {
    render(<App />);
    await userEvent.setup().click(screen.getByRole("button", { name: /open/i }));
    await waitFor(() => screen.getByText(/1280/));
    await userEvent.setup().click(screen.getByRole("button", { name: /export/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
