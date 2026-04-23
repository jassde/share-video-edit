import type { AppState, VideoMetadata, Segment } from "./types";

export type AppAction =
  | { type: "SET_VIDEO"; payload: VideoMetadata }
  | { type: "SET_CURRENT_TIME"; payload: number }
  | { type: "ADD_SEGMENT"; payload: Segment }
  | { type: "UPDATE_SEGMENT"; payload: Segment }
  | { type: "UPDATE_SEGMENT_COMMIT"; payload: Segment }
  | { type: "REMOVE_SEGMENT"; payload: string }
  | { type: "SET_ZOOM"; payload: number }
  | { type: "TOGGLE_EXPORT_DIALOG" }
  | { type: "SET_ACTIVE_SEGMENT"; payload: string | null }
  | { type: "UNDO" }
  | { type: "REDO" };

export interface HistoryState {
  past: AppState[];
  present: AppState;
  future: AppState[];
}

export const initialState: AppState = {
  video: null,
  currentTime: 0,
  segments: [],
  activeSegmentId: null,
  zoom: 1,
  exportDialogOpen: false,
};

export const initialHistory: HistoryState = {
  past: [],
  present: initialState,
  future: [],
};

const HISTORY_LIMIT = 50;

// Actions that should NOT create a history entry. Things like playhead
// scrubbing and ephemeral drag updates would flood the stack otherwise.
const NON_HISTORIED: ReadonlySet<AppAction["type"]> = new Set([
  "SET_CURRENT_TIME",
  "UPDATE_SEGMENT",
  "TOGGLE_EXPORT_DIALOG",
  "SET_ACTIVE_SEGMENT",
  "SET_ZOOM",
]);

function stepReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_VIDEO":
      return { ...state, video: action.payload, segments: [], activeSegmentId: null, currentTime: 0 };
    case "SET_CURRENT_TIME":
      return { ...state, currentTime: action.payload };
    case "ADD_SEGMENT":
      return { ...state, segments: [...state.segments, action.payload], activeSegmentId: action.payload.id };
    case "UPDATE_SEGMENT":
    case "UPDATE_SEGMENT_COMMIT":
      return { ...state, segments: state.segments.map((s) => s.id === action.payload.id ? { ...s, ...action.payload } : s) };
    case "REMOVE_SEGMENT":
      return {
        ...state,
        segments: state.segments.filter((s) => s.id !== action.payload),
        activeSegmentId: state.activeSegmentId === action.payload ? null : state.activeSegmentId,
      };
    case "SET_ZOOM":
      return { ...state, zoom: Math.min(20, Math.max(0.5, action.payload)) };
    case "TOGGLE_EXPORT_DIALOG":
      return { ...state, exportDialogOpen: !state.exportDialogOpen };
    case "SET_ACTIVE_SEGMENT":
      return { ...state, activeSegmentId: action.payload };
    default:
      return state;
  }
}

export function appReducer(state: AppState, action: AppAction): AppState {
  return stepReducer(state, action);
}

export function historyReducer(state: HistoryState, action: AppAction): HistoryState {
  if (action.type === "UNDO") {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future],
    };
  }
  if (action.type === "REDO") {
    if (state.future.length === 0) return state;
    const [next, ...rest] = state.future;
    return {
      past: [...state.past, state.present],
      present: next,
      future: rest,
    };
  }
  // Prevent no-op UPDATE_SEGMENT_COMMIT from polluting the undo stack.
  // UPDATE_SEGMENT (ephemeral drag) already updates present, so comparing
  // payload against present matches in both drag and no-drag cases. Instead,
  // compare against the last committed snapshot in past: if the segment value
  // in past[last] matches the commit payload, no net change occurred and we
  // can skip recording a history entry.
  //
  // Known limitation: a drag that returns to the original position and
  // releases will still record one history entry (because past[last] holds the
  // pre-drag value). Tracking net-zero drags would require additional state;
  // the extra entry is harmless and Undo correctly restores the same state.
  if (action.type === "UPDATE_SEGMENT_COMMIT" && state.past.length > 0) {
    const committed = state.past[state.past.length - 1].segments.find(
      (s) => s.id === action.payload.id
    );
    if (
      committed &&
      committed.inPoint === action.payload.inPoint &&
      committed.outPoint === action.payload.outPoint
    ) {
      return state;
    }
  }
  const nextPresent = stepReducer(state.present, action);
  if (nextPresent === state.present) return state;
  if (NON_HISTORIED.has(action.type)) {
    return { ...state, present: nextPresent };
  }
  // SET_VIDEO wipes history — no point undoing past a video swap.
  if (action.type === "SET_VIDEO") {
    return { past: [], present: nextPresent, future: [] };
  }
  const trimmedPast = state.past.length >= HISTORY_LIMIT ? state.past.slice(-HISTORY_LIMIT + 1) : state.past;
  return {
    past: [...trimmedPast, state.present],
    present: nextPresent,
    future: [],
  };
}
