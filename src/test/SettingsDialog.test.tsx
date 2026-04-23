import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { SettingsDialog } from "../components/SettingsDialog";

const mockInvoke = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockOpen = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mockOpen }));

const defaults = {
  isOpen: true, frameStepSize: 5, onChange: vi.fn(),
  secondStepSize: 1, onSecondStepChange: vi.fn(),
  ffmpegDir: "", onFfmpegDirChange: vi.fn(),
  onClose: vi.fn(),
};

describe("SettingsDialog", () => {
  it("does not render when isOpen is false", () => {
    render(<SettingsDialog {...defaults} isOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders dialog with the given frame step value", () => {
    render(<SettingsDialog {...defaults} frameStepSize={7} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect((screen.getByTestId("frame-step-slider") as HTMLInputElement).value).toBe("7");
    expect(screen.getByText(/7 frames/i)).toBeInTheDocument();
  });

  it("uses singular 'frame' for a step of 1", () => {
    render(<SettingsDialog {...defaults} frameStepSize={1} />);
    expect(screen.getByText(/1 frame$/i)).toBeInTheDocument();
  });

  it("slider updates the draft label without calling onChange until Save", () => {
    const onChange = vi.fn();
    render(<SettingsDialog {...defaults} onChange={onChange} />);
    const slider = screen.getByTestId("frame-step-slider") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "12" } });
    expect(screen.getByText(/12 frames/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("calls onChange + onClose when Save clicked", async () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(<SettingsDialog {...defaults} onChange={onChange} onClose={onClose} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /save/i }));
    expect(onChange).toHaveBeenCalledWith(5);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls only onClose when Cancel clicked", async () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(<SettingsDialog {...defaults} onChange={onChange} onClose={onClose} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /cancel/i }));
    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resets draft to the prop when reopened with a new value", () => {
    const { rerender } = render(<SettingsDialog {...defaults} isOpen={false} frameStepSize={3} />);
    rerender(<SettingsDialog {...defaults} isOpen={true} frameStepSize={9} />);
    expect((screen.getByTestId("frame-step-slider") as HTMLInputElement).value).toBe("9");
  });
});
