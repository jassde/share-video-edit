import type { VideoMetadata, Segment, ExportOptions, AppState } from "../types";

describe("types", () => {
  it("VideoMetadata has required numeric fields", () => {
    const m: VideoMetadata = { duration: 120.5, width: 1920, height: 1080, fps: 29.97, path: "/v.mp4" };
    expect(m.fps).toBe(29.97);
  });
  it("Segment has id, inPoint, outPoint", () => {
    const s: Segment = { id: "s1", inPoint: 0, outPoint: 10.5 };
    expect(s.id).toBe("s1");
  });
  it("ExportOptions has codec, lossless, outputDir, crf, preset, concat", () => {
    const o: ExportOptions = {
      outputDir: "/tmp",
      codec: "h264",
      lossless: false,
      crf: 23,
      preset: "medium",
      concat: false,
    };
    expect(o.codec).toBe("h264");
    expect(o.preset).toBe("medium");
  });
  it("AppState initialises with empty segments", () => {
    const state: AppState = { video: null, currentTime: 0, segments: [], activeSegmentId: null, zoom: 1, exportDialogOpen: false };
    expect(state.segments).toHaveLength(0);
  });
});
