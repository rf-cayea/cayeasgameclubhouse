import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), dispatchEvent: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));

import {
  fetchModerationReports, fetchModerationRole, resolveModerationReport,
  type ModerationReport,
} from "../src/lib/moderation-api";

const pending: ModerationReport = {
  id: "report-id", context: "post", context_id: "content-id", reported_user_id: "player-id",
  reporter_id: "reporter-id", reason: "Abusive post", evidence: { author_name: "Player", body: "Reported body" },
  status: "pending", created_at: "2026-11-01T12:00:00Z", resolved_at: null, resolved_by: null, resolution: null,
};

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.dispatchEvent.mockReset();
  vi.stubGlobal("window", { dispatchEvent: mocks.dispatchEvent });
});

describe("moderation server access", () => {
  it("fails closed on an unrecognized role rather than granting access", async () => {
    mocks.rpc.mockResolvedValue({ data: "owner", error: null });
    await expect(fetchModerationRole()).rejects.toThrow("unrecognized moderation role");
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchModerationRole()).toBeNull();
  });

  it("propagates a permission denial rather than displaying an empty report queue", async () => {
    const denied = { code: "42501", message: "Moderator role required" };
    mocks.rpc.mockResolvedValue({ data: null, error: denied });
    await expect(fetchModerationReports("pending", 0)).rejects.toBe(denied);
  });

  it("rejects malformed report data and keeps preserved evidence text as data", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...pending, evidence: { body: "<script>untrusted text</script>" } }], error: null });
    const reports = await fetchModerationReports("pending", 0);
    expect(reports[0]?.evidence.body).toBe("<script>untrusted text</script>");
    mocks.rpc.mockResolvedValue({ data: [{ ...pending, context: "unknown" }], error: null });
    await expect(fetchModerationReports("pending", 0)).rejects.toThrow("invalid report");
  });
});

describe("review submission", () => {
  it("refuses content actions for a player-only report", async () => {
    await expect(resolveModerationReport({ ...pending, context: "player", context_id: null }, "delete_content", "Confirmed abuse")).rejects.toThrow("does not apply");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires a useful review note and a valid version for reviewed reports", async () => {
    await expect(resolveModerationReport(pending, "hide_content", "  ")).rejects.toThrow("review note");
    await expect(resolveModerationReport({ ...pending, status: "resolved" }, "hide_content", "Confirmed abuse")).rejects.toThrow("Refresh this reviewed report");
    await expect(resolveModerationReport({ ...pending, status: "dismissed", resolved_at: "invalid" }, "hide_content", "Confirmed abuse")).rejects.toThrow("Refresh this reviewed report");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("sends the exact reviewed timestamp for a follow-up without losing PostgreSQL precision", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "resolved" }, error: null });
    const resolved_at = "2026-11-01T12:34:56.123456+00:00";
    await resolveModerationReport({ ...pending, status: "resolved", resolved_at }, "mute_chat", "Repeated chat abuse");
    expect(mocks.rpc).toHaveBeenCalledWith("moderate_report", {
      _report_id: pending.id, _action: "mute_chat", _note: "Repeated chat abuse", _expected_resolved_at: resolved_at,
    });
    expect(mocks.dispatchEvent).toHaveBeenCalledOnce();
  });

  it("notifies the lounge only after the server commits the action", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "resolved" }, error: null });
    await resolveModerationReport(pending, "hide_content", "  Confirmed abuse  ");
    expect(mocks.rpc).toHaveBeenCalledWith("moderate_report", {
      _report_id: pending.id, _action: "hide_content", _note: "Confirmed abuse",
    });
    expect(mocks.dispatchEvent).toHaveBeenCalledOnce();
    expect(mocks.dispatchEvent.mock.calls[0]?.[0]?.type).toBe("clubhouse-moderation-changed");
  });

  it("does not announce success if the backend rejects a stale or unauthorized action", async () => {
    const denial = { code: "42501", message: "Permission denied" };
    mocks.rpc.mockResolvedValue({ data: null, error: denial });
    await expect(resolveModerationReport(pending, "ban_chat", "Repeated abuse")).rejects.toBe(denial);
    expect(mocks.dispatchEvent).not.toHaveBeenCalled();
  });
});
