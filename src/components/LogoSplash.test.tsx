import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import LogoSplash from "./LogoSplash";

// Helpers to drive the two environment signals the splash reads.
function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function setNavigationType(type: string) {
  vi.spyOn(performance, "getEntriesByType").mockReturnValue([
    { type } as unknown as PerformanceEntry,
  ]);
}

beforeEach(() => {
  setReducedMotion(false);
  setNavigationType("navigate");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("LogoSplash", () => {
  it("plays on a fresh load with a muted, autoplay, controls-free video", () => {
    render(<LogoSplash />);

    const dialog = screen.getByRole("dialog", { name: "Brand introduction" });
    expect(dialog).toBeInTheDocument();

    const video = dialog.querySelector("video") as HTMLVideoElement;
    expect(video).toBeTruthy();
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("playsinline");
    expect(video.muted).toBe(true);
    expect(video.hasAttribute("controls")).toBe(false);
    expect(video).toHaveAttribute("aria-hidden", "true");
    expect(video).toHaveAttribute("poster", "/turnkey-logo-intro-poster.jpg");

    // WebM first (modern), MP4 fallback second.
    const sources = Array.from(video.querySelectorAll("source"));
    expect(sources.map((s) => s.getAttribute("src"))).toEqual([
      "/turnkey-logo-intro.webm",
      "/turnkey-logo-intro.mp4",
    ]);
    expect(sources.map((s) => s.getAttribute("type"))).toEqual([
      "video/webm",
      "video/mp4",
    ]);
  });

  it("renders nothing when the user prefers reduced motion", () => {
    setReducedMotion(true);
    render(<LogoSplash />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not replay on back/forward navigation", () => {
    setNavigationType("back_forward");
    render(<LogoSplash />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("fades out and unmounts when the video ends", () => {
    vi.useFakeTimers();
    render(<LogoSplash />);
    const dialog = screen.getByRole("dialog");
    const video = dialog.querySelector("video") as HTMLVideoElement;

    fireEvent.ended(video);
    // Fade begins immediately (opacity-0 applied).
    expect(dialog).toHaveClass("opacity-0");

    // After the fade duration it is gone.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("dismisses when the skip button is pressed", () => {
    vi.useFakeTimers();
    render(<LogoSplash />);
    const skip = screen.getByRole("button", { name: "Skip brand introduction" });

    fireEvent.click(skip);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("dismisses when the overlay is clicked", () => {
    vi.useFakeTimers();
    render(<LogoSplash />);
    const dialog = screen.getByRole("dialog");

    fireEvent.click(dialog);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("dismisses on the Escape key", () => {
    vi.useFakeTimers();
    render(<LogoSplash />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("auto-dismisses via the 7s failsafe when the video never ends", () => {
    vi.useFakeTimers();
    render(<LogoSplash />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Failsafe (7s) then fade (600ms).
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("dismisses immediately if the video errors (asset missing)", () => {
    vi.useFakeTimers();
    render(<LogoSplash />);
    const video = screen.getByRole("dialog").querySelector("video") as HTMLVideoElement;

    fireEvent.error(video);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
