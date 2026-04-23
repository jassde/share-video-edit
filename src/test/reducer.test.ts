import { appReducer, initialState, historyReducer, initialHistory } from "../reducer";
import type { VideoMetadata, Segment } from "../types";

const VIDEO: VideoMetadata = { duration: 60, width: 1280, height: 720, fps: 30, path: "/v.mp4" };

describe("appReducer", () => {
  it("SET_VIDEO resets segments and currentTime", () => {
    const state = appReducer(
      { ...initialState, segments: [{ id: "s1", inPoint: 1, outPoint: 5 }] },
      { type: "SET_VIDEO", payload: VIDEO }
    );
    expect(state.video).toEqual(VIDEO);
    expect(state.segments).toHaveLength(0);
    expect(state.currentTime).toBe(0);
  });
  it("SET_CURRENT_TIME updates currentTime", () => {
    expect(appReducer(initialState, { type: "SET_CURRENT_TIME", payload: 12.5 }).currentTime).toBe(12.5);
  });
  it("ADD_SEGMENT appends and sets active", () => {
    const seg: Segment = { id: "s1", inPoint: 0, outPoint: 10 };
    const state = appReducer(initialState, { type: "ADD_SEGMENT", payload: seg });
    expect(state.segments).toHaveLength(1);
    expect(state.activeSegmentId).toBe("s1");
  });
  it("UPDATE_SEGMENT only mutates matching segment", () => {
    const base = { ...initialState, segments: [
      { id: "s1", inPoint: 0, outPoint: 10 },
      { id: "s2", inPoint: 15, outPoint: 25 },
    ]};
    const state = appReducer(base, { type: "UPDATE_SEGMENT", payload: { id: "s1", inPoint: 2, outPoint: 8 } });
    expect(state.segments[0]).toEqual({ id: "s1", inPoint: 2, outPoint: 8 });
    expect(state.segments[1]).toEqual({ id: "s2", inPoint: 15, outPoint: 25 });
  });
  it("REMOVE_SEGMENT removes item and clears activeSegmentId if it matches", () => {
    const base = { ...initialState, segments: [{ id: "s1", inPoint: 0, outPoint: 5 }, { id: "s2", inPoint: 10, outPoint: 20 }], activeSegmentId: "s1" };
    const state = appReducer(base, { type: "REMOVE_SEGMENT", payload: "s1" });
    expect(state.segments).toHaveLength(1);
    expect(state.activeSegmentId).toBeNull();
  });
  it("REMOVE_SEGMENT preserves activeSegmentId when different segment removed", () => {
    const base = { ...initialState, segments: [{ id: "s1", inPoint: 0, outPoint: 5 }, { id: "s2", inPoint: 10, outPoint: 20 }], activeSegmentId: "s2" };
    expect(appReducer(base, { type: "REMOVE_SEGMENT", payload: "s1" }).activeSegmentId).toBe("s2");
  });
  it("SET_ZOOM clamps to [0.5, 20]", () => {
    expect(appReducer(initialState, { type: "SET_ZOOM", payload: 0 }).zoom).toBe(0.5);
    expect(appReducer(initialState, { type: "SET_ZOOM", payload: 999 }).zoom).toBe(20);
    expect(appReducer(initialState, { type: "SET_ZOOM", payload: 4 }).zoom).toBe(4);
  });
  it("TOGGLE_EXPORT_DIALOG flips exportDialogOpen", () => {
    const open = appReducer(initialState, { type: "TOGGLE_EXPORT_DIALOG" });
    expect(open.exportDialogOpen).toBe(true);
    expect(appReducer(open, { type: "TOGGLE_EXPORT_DIALOG" }).exportDialogOpen).toBe(false);
  });
  it("SET_ACTIVE_SEGMENT sets activeSegmentId", () => {
    expect(appReducer(initialState, { type: "SET_ACTIVE_SEGMENT", payload: "s1" }).activeSegmentId).toBe("s1");
  });
});

describe("historyReducer", () => {
  const seg1: Segment = { id: "s1", inPoint: 0, outPoint: 5 };
  const seg2: Segment = { id: "s2", inPoint: 10, outPoint: 20 };

  it("records ADD_SEGMENT in past and UNDO restores prior present", () => {
    let h = historyReducer(initialHistory, { type: "ADD_SEGMENT", payload: seg1 });
    expect(h.present.segments).toHaveLength(1);
    expect(h.past).toHaveLength(1);
    h = historyReducer(h, { type: "UNDO" });
    expect(h.present.segments).toHaveLength(0);
    expect(h.future).toHaveLength(1);
  });

  it("REDO re-applies an undone change", () => {
    let h = historyReducer(initialHistory, { type: "ADD_SEGMENT", payload: seg1 });
    h = historyReducer(h, { type: "UNDO" });
    h = historyReducer(h, { type: "REDO" });
    expect(h.present.segments).toEqual([seg1]);
    expect(h.future).toHaveLength(0);
  });

  it("new action after undo clears the future stack", () => {
    let h = historyReducer(initialHistory, { type: "ADD_SEGMENT", payload: seg1 });
    h = historyReducer(h, { type: "UNDO" });
    h = historyReducer(h, { type: "ADD_SEGMENT", payload: seg2 });
    expect(h.future).toHaveLength(0);
    expect(h.present.segments).toEqual([seg2]);
  });

  it("SET_CURRENT_TIME does NOT pollute history", () => {
    const h = historyReducer(initialHistory, { type: "SET_CURRENT_TIME", payload: 3 });
    expect(h.past).toHaveLength(0);
    expect(h.present.currentTime).toBe(3);
  });

  it("UPDATE_SEGMENT (ephemeral drag) does not record, commit does", () => {
    let h = historyReducer(initialHistory, { type: "ADD_SEGMENT", payload: seg1 });
    const pastAfterAdd = h.past.length;
    h = historyReducer(h, { type: "UPDATE_SEGMENT", payload: { ...seg1, outPoint: 7 } });
    expect(h.past.length).toBe(pastAfterAdd);
    h = historyReducer(h, { type: "UPDATE_SEGMENT_COMMIT", payload: { ...seg1, outPoint: 7 } });
    expect(h.past.length).toBe(pastAfterAdd + 1);
  });

  it("SET_VIDEO wipes history", () => {
    let h = historyReducer(initialHistory, { type: "ADD_SEGMENT", payload: seg1 });
    h = historyReducer(h, { type: "ADD_SEGMENT", payload: seg2 });
    const video: VideoMetadata = { duration: 10, width: 100, height: 100, fps: 30, path: "/v.mp4" };
    h = historyReducer(h, { type: "SET_VIDEO", payload: video });
    expect(h.past).toHaveLength(0);
    expect(h.future).toHaveLength(0);
  });

  it("UNDO on empty past is a no-op", () => {
    const h = historyReducer(initialHistory, { type: "UNDO" });
    expect(h).toBe(initialHistory);
  });

  it("UPDATE_SEGMENT_COMMIT with unchanged values does not add history entry", () => {
    let h = historyReducer(initialHistory, { type: "ADD_SEGMENT", payload: seg1 });
    // First commit records the add
    h = historyReducer(h, { type: "UPDATE_SEGMENT_COMMIT", payload: seg1 });
    const pastLengthAfterFirstCommit = h.past.length;
    // Click without moving — commit with same values should not record
    h = historyReducer(h, { type: "UPDATE_SEGMENT_COMMIT", payload: seg1 });
    expect(h.past.length).toBe(pastLengthAfterFirstCommit);
  });
});
