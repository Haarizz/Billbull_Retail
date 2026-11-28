import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/platformAnnouncementsApi", () => ({
  getPendingAnnouncements: vi.fn(),
  markAnnouncementSeen: vi.fn(),
}));

import { getPendingAnnouncements, markAnnouncementSeen } from "../../api/platformAnnouncementsApi";
import PlatformAnnouncements, { kindOf, mergeQueue } from "../PlatformAnnouncements";

const TWO = [
  { id: 1, kind: "MAINTENANCE", title: "Server maintenance", message: "Sunday 2am" },
  { id: 2, kind: "FEATURE", title: "New reports", message: "Look!" },
];

describe("PlatformAnnouncements (Retail)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markAnnouncementSeen.mockResolvedValue({ recorded: true });
  });

  it("shows pending announcements one at a time and records each dismissal", async () => {
    getPendingAnnouncements.mockResolvedValue(TWO);
    render(<PlatformAnnouncements />);

    expect(await screen.findByText("Server maintenance")).toBeInTheDocument();
    expect(screen.getByText("1 more after this")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Got it, next" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Got it, next" }));

    expect(await screen.findByText("New reports")).toBeInTheDocument();
    expect(markAnnouncementSeen).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(markAnnouncementSeen).toHaveBeenCalledWith(2);
  });

  it("renders nothing when the backend has none or cannot answer", async () => {
    getPendingAnnouncements.mockRejectedValue(new Error("404"));
    render(<PlatformAnnouncements />);
    await waitFor(() => expect(getPendingAnnouncements).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes even if recording the dismissal fails", async () => {
    getPendingAnnouncements.mockResolvedValue([{ id: 5, kind: "INFO", title: "Hi", message: "m" }]);
    markAnnouncementSeen.mockRejectedValue(new Error("offline"));
    render(<PlatformAnnouncements />);
    fireEvent.click(await screen.findByRole("button", { name: "Got it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("merging a re-check keeps order and never re-adds a dismissed one", () => {
    const q = [{ id: 1 }];
    expect(mergeQueue(q, [{ id: 1 }, { id: 2 }, { id: 3 }], new Set([3])).map((a) => a.id)).toEqual([1, 2]);
    expect(mergeQueue(q, [{ id: 1 }], new Set())).toBe(q);
    expect(kindOf("UNKNOWN").label).toBe("Information");
  });
});

describe("PlatformAnnouncements (till)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markAnnouncementSeen.mockResolvedValue({ recorded: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not take focus, so the scan field keeps it", async () => {
    getPendingAnnouncements.mockResolvedValue(TWO);
    render(<PlatformAnnouncements variant="till" />);
    const button = await screen.findByRole("button", { name: "Got it, next" });
    expect(button).not.toHaveFocus();
  });

  it("ignores a keyboard-activated click (a scanner's Enter) and closes on a real click", async () => {
    getPendingAnnouncements.mockResolvedValue([TWO[0]]);
    render(<PlatformAnnouncements variant="till" />);
    const button = await screen.findByRole("button", { name: "Got it" });

    fireEvent.click(button, { detail: 0 });
    expect(markAnnouncementSeen).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(button, { detail: 1 });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(markAnnouncementSeen).toHaveBeenCalledWith(1);
  });

  it("checks once at sign-in and never re-checks mid-shift", async () => {
    vi.useFakeTimers();
    getPendingAnnouncements.mockResolvedValue([]);
    render(<PlatformAnnouncements variant="till" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    });
    expect(getPendingAnnouncements).toHaveBeenCalledTimes(1);
  });

  it("the Retail app does re-check every 5 minutes", async () => {
    vi.useFakeTimers();
    getPendingAnnouncements.mockResolvedValue([]);
    render(<PlatformAnnouncements />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 10);
    });
    expect(getPendingAnnouncements).toHaveBeenCalledTimes(2);
  });
});
