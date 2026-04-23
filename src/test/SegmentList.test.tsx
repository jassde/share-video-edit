import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { SegmentList } from "../components/SegmentList";
import type { Segment } from "../types";

const SEGS: Segment[] = [{ id: "s1", inPoint: 0, outPoint: 10.5 }, { id: "s2", inPoint: 30, outPoint: 45.25 }];
const defaults = { segments: SEGS, activeSegmentId: "s1", onSelect: vi.fn(), onDelete: vi.fn() };

describe("SegmentList", () => {
  it("renders all segments", () => {
    render(<SegmentList {...defaults} />);
    expect(screen.getAllByTestId(/segment-item/)).toHaveLength(2);
  });
  it("shows formatted timecodes", () => {
    render(<SegmentList {...defaults} />);
    expect(screen.getByText(/0:00\.000/)).toBeInTheDocument();
    expect(screen.getByText(/0:10\.500/)).toBeInTheDocument();
  });
  it("calls onDelete with id when Delete clicked", async () => {
    const onDelete = vi.fn();
    render(<SegmentList {...defaults} onDelete={onDelete} />);
    await userEvent.setup().click(screen.getAllByRole("button", { name: /delete/i })[0]);
    expect(onDelete).toHaveBeenCalledWith("s1");
  });
  it("marks active segment with active class", () => {
    render(<SegmentList {...defaults} activeSegmentId="s2" />);
    expect(screen.getAllByTestId(/segment-item/)[1]).toHaveClass("segment-item--active");
  });
  it("shows empty state when no segments", () => {
    render(<SegmentList segments={[]} activeSegmentId={null} onSelect={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/no segments/i)).toBeInTheDocument();
  });
});
