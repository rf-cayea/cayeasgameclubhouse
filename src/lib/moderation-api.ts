import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ModerationRole = "admin" | "moderator";
export type ReportStatus = "pending" | "resolved" | "dismissed";
export type ReportContext = "post" | "chat" | "player";
export type ModerationAction = "hide_content" | "delete_content" | "mute_chat" | "unmute_chat" | "ban_chat" | "unban_chat" | "flag_name" | "reset_name" | "dismiss";

export interface ModerationReport {
  id: string;
  context: ReportContext;
  context_id: string | null;
  reported_user_id: string;
  reporter_id: string;
  reason: string;
  evidence: Record<string, unknown>;
  status: ReportStatus;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution: string | null;
}

export const REPORT_PAGE_SIZE = 50;
export const MODERATION_CHANGED_EVENT = "clubhouse-moderation-changed";

export const MODERATION_ACTIONS: readonly { action: ModerationAction; label: string; description: string; contentOnly?: boolean }[] = [
  { action: "hide_content", label: "Hide content", description: "Remove this post or message from the public lounge. Keep its evidence snapshot for review.", contentOnly: true },
  { action: "delete_content", label: "Delete content", description: "Permanently delete this post or message. The report’s evidence snapshot remains in the review history.", contentOnly: true },
  { action: "mute_chat", label: "Mute chat for 24 hours", description: "Prevent this player from sending lounge chat messages for 24 hours." },
  { action: "unmute_chat", label: "Remove chat mute", description: "Remove this player’s timed chat mute. An existing chat ban stays in place." },
  { action: "ban_chat", label: "Ban from chat", description: "Prevent this player from sending chat messages until a moderator removes the ban." },
  { action: "unban_chat", label: "Remove chat ban", description: "Remove this player’s indefinite chat ban. An existing timed mute stays in place." },
  { action: "flag_name", label: "Hide display name", description: "Replace this player’s name with a neutral label in the public lounge while it is flagged." },
  { action: "reset_name", label: "Reset display name", description: "Replace this player’s stored display name with a neutral name." },
  { action: "dismiss", label: "Dismiss report", description: "Close this report without changing the player or their content." },
];

export function moderationActionsFor(context: ReportContext) {
  return MODERATION_ACTIONS.filter(item => !item.contentOnly || context === "post" || context === "chat");
}

export function moderationErrorMessage(cause: unknown) {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "object" && cause !== null && "message" in cause && typeof cause.message === "string") return cause.message;
  return "The moderation request failed. Please try again.";
}

function requireClient() {
  if (!supabase) throw new Error("The Clubhouse backend is not connected yet.");
  return supabase;
}

export async function fetchModerationRole(): Promise<ModerationRole | null> {
  const { data, error } = await requireClient().rpc("moderation_role");
  if (error) throw error;
  if (data === null) return null;
  if (data !== "admin" && data !== "moderator") throw new Error("The server returned an unrecognized moderation role.");
  return data;
}

export async function fetchModerationReports(status: ReportStatus, offset: number): Promise<ModerationReport[]> {
  const { data, error } = await requireClient().rpc("moderation_reports", {
    _status: status, _offset: offset, _limit: REPORT_PAGE_SIZE,
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("The server returned an invalid report list.");
  return data.map((row: unknown) => {
    if (typeof row !== "object" || row === null) throw new Error("The server returned an invalid report.");
    const report = row as Record<string, unknown>;
    if (!["id", "reported_user_id", "reporter_id", "reason", "created_at"].every(key => typeof report[key] === "string") ||
      !["post", "chat", "player"].includes(String(report.context)) ||
      !["pending", "resolved", "dismissed"].includes(String(report.status))) throw new Error("The server returned an invalid report.");
    return {
      ...report,
      context_id: typeof report.context_id === "string" ? report.context_id : null,
      evidence: typeof report.evidence === "object" && report.evidence !== null && !Array.isArray(report.evidence)
        ? report.evidence : {},
      resolved_at: typeof report.resolved_at === "string" ? report.resolved_at : null,
      resolved_by: typeof report.resolved_by === "string" ? report.resolved_by : null,
      resolution: typeof report.resolution === "string" ? report.resolution : null,
    } as ModerationReport;
  });
}

export async function resolveModerationReport(report: ModerationReport, action: ModerationAction, note: string) {
  const followUp = report.status !== "pending";
  if (followUp && (!report.resolved_at || !Number.isFinite(Date.parse(report.resolved_at)))) {
    throw new Error("Refresh this reviewed report before taking an additional action.");
  }
  if (!moderationActionsFor(report.context).some(item => item.action === action)) throw new Error("This action does not apply to the report.");
  const trimmedNote = note.trim();
  if (trimmedNote.length < 3 || trimmedNote.length > 1000) throw new Error("Add a review note between 3 and 1,000 characters.");
  const { error } = await requireClient().rpc("moderate_report", {
    _report_id: report.id, _action: action, _note: trimmedNote,
    // Keep PostgreSQL's timestamp precision unchanged for its version check.
    ...(followUp ? { _expected_resolved_at: report.resolved_at } : {}),
  });
  if (error) throw error;
  window.dispatchEvent(new Event(MODERATION_CHANGED_EVENT));
}

/** Navigation checks are advisory; every privileged operation is authorized again by PostgreSQL. */
export function useModerationRole(userId: string | null | undefined) {
  const [state, setState] = useState<{ userId: string | null; role: ModerationRole | null; ready: boolean; error: string | null }>({
    userId: null, role: null, ready: false, error: null,
  });
  const active = useRef(false);
  const request = useRef(0);
  const reload = useCallback(async () => {
    const current = ++request.current;
    const currentUserId = userId ?? null;
    const isCurrent = () => active.current && request.current === current;
    if (!currentUserId || !supabase) {
      if (isCurrent()) setState({ userId: currentUserId, role: null, ready: true, error: null });
      return;
    }
    try {
      const role = await fetchModerationRole();
      if (isCurrent()) setState({ userId: currentUserId, role, ready: true, error: null });
    } catch (cause) {
      if (isCurrent()) setState({ userId: currentUserId, role: null, ready: true, error: moderationErrorMessage(cause) });
    }
  }, [userId]);

  useEffect(() => {
    active.current = true;
    void reload();
    const refresh = () => { void reload(); };
    const timer = userId && supabase ? setInterval(refresh, 30_000) : undefined;
    const channel = userId && supabase ? supabase.channel(`moderation-role-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clubhouse_invalidations" }, refresh).subscribe() : null;
    window.addEventListener("focus", refresh);
    window.addEventListener(MODERATION_CHANGED_EVENT, refresh);
    return () => {
      active.current = false;
      ++request.current;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(MODERATION_CHANGED_EVENT, refresh);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [userId, reload]);

  const current = state.userId === (userId ?? null);
  return {
    role: current ? state.role : null,
    ready: !userId || !supabase || (current && state.ready),
    error: current ? state.error : null,
    reload,
  };
}
