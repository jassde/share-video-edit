import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach } from "vitest";
import { ExportDialog } from "../components/ExportDialog";
import type { Segment } from "../types";

const mockOpen = vi.hoisted(() => vi.fn().mockResolvedValue("/output/folder"));
const mockListen = vi.hoisted(() => vi.fn().mockResolvedValue(() => {}));

// invoke is called for both detect_encoders and export_segments; route by command name.
const mockInvoke = vi.hoisted(() =>
  vi.fn((cmd: string) => {
    if (cmd === "detect_encoders") return Promise.resolve([]);
    return Promise.resolve(["/output/clip_1.mp4"]);
  })
);

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mockOpen }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mockListen }));

const SEGS: Segment[] = [{ id: "s1", inPoint: 5, outPoint: 15 }];
const defaults = { isOpen: true, segments: SEGS, sourcePath: "/video/clip.mp4", ffmpegDir: "", onClose: vi.fn() };

beforeEach(() => { mockInvoke.mockClear(); mockOpen.mockClear(); });

describe("ExportDialog", () => {
  it("does not render when isOpen is false", () => {
    render(<ExportDialog {...defaults} isOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders dialog when isOpen is true", async () => {
    render(<ExportDialog {...defaults} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("encoder dropdown defaults to h264", async () => {
    render(<ExportDialog {...defaults} />);
    expect((screen.getByLabelText(/codec/i) as HTMLSelectElement).value).toBe("h264");
  });

  it("has all four software codec options", () => {
    render(<ExportDialog {...defaults} />);
    const encoderSelect = screen.getByLabelText(/codec/i) as HTMLSelectElement;
    const vals = Array.from(encoderSelect.options).map((o) => o.value);
    expect(vals).toEqual(expect.arrayContaining(["h264", "h265", "vp9", "av1"]));
  });

  it("lossless checkbox is unchecked by default", () => {
    render(<ExportDialog {...defaults} />);
    expect((screen.getByLabelText(/lossless/i) as HTMLInputElement).checked).toBe(false);
  });

  it("opens directory dialog when Browse clicked", async () => {
    render(<ExportDialog {...defaults} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /browse/i }));
    await waitFor(() => expect(mockOpen).toHaveBeenCalled());
  });

  it("calls invoke export_segments when Export clicked after Browse", async () => {
    render(<ExportDialog {...defaults} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /browse/i }));
    await waitFor(() => expect(mockOpen).toHaveBeenCalled());
    await userEvent.setup().click(screen.getByRole("button", { name: /^export$/i }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("export_segments",
        expect.objectContaining({ source: "/video/clip.mp4" }))
    );
  });

  it("calls onClose when Cancel clicked", async () => {
    const onClose = vi.fn();
    render(<ExportDialog {...defaults} onClose={onClose} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // --- Templates ---
  it("renders the Template dropdown", () => {
    render(<ExportDialog {...defaults} />);
    expect(screen.getByLabelText(/export template/i)).toBeInTheDocument();
  });

  it("applying YouTube H.264 template sets codec to h264 and crf to 18", async () => {
    render(<ExportDialog {...defaults} />);
    const tmpl = screen.getByLabelText(/export template/i);
    await userEvent.setup().selectOptions(tmpl, "YouTube (H.264 High Quality)");
    expect((screen.getByLabelText(/codec/i) as HTMLSelectElement).value).toBe("h264");
    // CRF slider should show 18
    expect((screen.getByLabelText(/crf/i) as HTMLInputElement).value).toBe("18");
  });

  it("applying Archive template enables lossless checkbox", async () => {
    render(<ExportDialog {...defaults} />);
    const tmpl = screen.getByLabelText(/export template/i);
    await userEvent.setup().selectOptions(tmpl, "Archive (Lossless stream copy)");
    expect((screen.getByLabelText(/lossless/i) as HTMLInputElement).checked).toBe(true);
  });

  it("template note appears after template selection", async () => {
    render(<ExportDialog {...defaults} />);
    const tmpl = screen.getByLabelText(/export template/i);
    await userEvent.setup().selectOptions(tmpl, "YouTube (H.264 High Quality)");
    expect(screen.getByText(/crf 18/i)).toBeInTheDocument();
  });

  // --- GPU encoders ---
  it("calls detect_encoders when dialog opens", async () => {
    render(<ExportDialog {...defaults} />);
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("detect_encoders", expect.objectContaining({ ffmpegDir: "" }))
    );
  });

  it("shows GPU optgroup when encoders are detected", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "detect_encoders") return Promise.resolve(["h264_nvenc", "hevc_nvenc"]);
      return Promise.resolve(["/out/clip.mp4"]);
    });
    render(<ExportDialog {...defaults} />);
    await waitFor(() => {
      const select = screen.getByLabelText(/codec/i) as HTMLSelectElement;
      const values = Array.from(select.options).map((o) => o.value);
      expect(values).toContain("h264_nvenc");
      expect(values).toContain("hevc_nvenc");
    });
  });

  it("hides Speed Preset when a GPU encoder is selected", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "detect_encoders") return Promise.resolve(["h264_nvenc"]);
      return Promise.resolve(["/out/clip.mp4"]);
    });
    render(<ExportDialog {...defaults} />);
    await waitFor(() => screen.getByText(/H\.264 — NVIDIA GPU/i));
    const encoderSelect = screen.getByLabelText(/codec/i) as HTMLSelectElement;
    await userEvent.setup().selectOptions(encoderSelect, "h264_nvenc");
    expect(screen.queryByLabelText(/preset/i)).not.toBeInTheDocument();
  });
});
