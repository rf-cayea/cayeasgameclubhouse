import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { HubNav } from "@/components/HubNav";
import { supabase } from "@/integrations/supabase/client";
import { useClubhouse } from "@/lib/clubhouse";
import {
  fetchModerationReports, moderationActionsFor, moderationErrorMessage,
  REPORT_PAGE_SIZE, resolveModerationReport, useModerationRole,
  type ModerationAction, type ModerationReport, type ReportStatus,
} from "@/lib/moderation-api";

export const Route = createFileRoute("/moderation")({
  head: () => ({ meta: [{ title: "Moderation — Cayea's Game Clubhouse" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: ModerationPage,
});

function ModerationPage() {
  const { user, ready } = useClubhouse();
  const access = useModerationRole(user?.id);
  return <>
    <HubNav />
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-4xl text-gold">Moderation</h1>
      <p className="mt-2 text-muted-foreground">Review player reports, preserve their evidence, and keep the lounge welcoming.</p>
      {!supabase ? <section className="card-hub mt-6"><h2 className="font-display text-2xl text-gold">Moderation is not connected yet</h2><p className="mt-2 text-muted-foreground">Connect the Clubhouse backend to use the moderation panel.</p></section>
        : !ready || !access.ready ? <p role="status" className="mt-6">Checking moderator access…</p>
          : !user ? <section className="card-hub mt-6"><p>Sign in with your moderator or administrator account to review reports.</p><Link to="/auth" className="btn-gold mt-4">Sign in</Link></section>
            : access.error ? <section className="card-hub mt-6"><p role="alert" className="text-destructive">Could not verify moderator access: {access.error}</p><button className="btn-ghost-gold mt-4" onClick={() => void access.reload()}>Check access again</button></section>
              : !access.role ? <section className="card-hub mt-6"><h2 className="font-display text-2xl text-gold">Moderator access required</h2><p className="mt-2 text-muted-foreground">This account cannot review player reports or take moderation actions.</p><Link to="/clubhouse" className="btn-ghost-gold mt-4">Back to the lounge</Link></section>
                : <ReportQueue key={user.id} role={access.role} recheckAccess={access.reload} />}
    </main>
  </>;
}

function ReportQueue({ role, recheckAccess }: { role: "admin" | "moderator"; recheckAccess: () => Promise<void> }) {
  const [status, setStatus] = useState<ReportStatus>("pending");
  const [offset, setOffset] = useState(0);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ report: ModerationReport; action: ModerationAction } | null>(null);
  const active = useRef(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    const version = ++request.current;
    const isCurrent = () => active.current && request.current === version;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchModerationReports(status, offset);
      if (isCurrent()) setReports(rows);
    } catch (cause) {
      if (!isCurrent()) return;
      // Clear any previously loaded evidence if the server withdraws access.
      setReports([]);
      setError(moderationErrorMessage(cause));
      void recheckAccess();
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [status, offset, recheckAccess]);

  useEffect(() => {
    active.current = true;
    setReports([]);
    void load();
    return () => { active.current = false; ++request.current; };
  }, [load]);

  function changeStatus(next: ReportStatus) {
    setStatus(next);
    setOffset(0);
    setNotice(null);
    setSelected(null);
  }

  async function reviewed(report: ModerationReport, action: ModerationAction, note: string) {
    try {
      await resolveModerationReport(report, action, note);
      if (!active.current) return;
      setSelected(null);
      setNotice(action === "dismiss" ? "Report dismissed. Your review was recorded." : report.status === "pending" ? "Moderation action saved. The lounge will refresh its public content." : "Additional action saved in the review history. The lounge will refresh its public content.");
      await load();
    } catch (cause) {
      void recheckAccess();
      throw cause;
    }
  }

  return <section className="mt-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">Signed in as {role === "admin" ? "an administrator" : "a moderator"}. Every action is recorded.</p>
      <button className="btn-ghost-gold text-sm" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh reports"}</button>
    </div>
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Report status filters">
      {(["pending", "resolved", "dismissed"] as const).map(value => <button key={value} className={status === value ? "btn-gold text-sm" : "btn-ghost-gold text-sm"} aria-pressed={status === value} onClick={() => changeStatus(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
    </div>
    {notice && <p role="status" className="mt-4 rounded-xl border border-border px-4 py-3 text-sm text-gold">{notice}</p>}
    {error && <p role="alert" className="mt-4 text-destructive">Could not load reports: {error}</p>}
    {loading ? <p role="status" className="mt-6">Loading {status} reports…</p>
      : !error && reports.length === 0 ? <p role="status" className="card-hub mt-6">{offset === 0 ? `No ${status} reports.` : "There are no more reports on this page."}</p>
        : <ul className="mt-6 space-y-4">{reports.map(report => <li key={report.id}><ReportCard report={report} chooseAction={action => setSelected({ report, action })} /></li>)}</ul>}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">Page {Math.floor(offset / REPORT_PAGE_SIZE) + 1} · Up to {REPORT_PAGE_SIZE} reports per page</p>
      <div className="flex gap-2"><button className="btn-ghost-gold text-sm" disabled={loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - REPORT_PAGE_SIZE))}>Previous page</button><button className="btn-ghost-gold text-sm" disabled={loading || Boolean(error) || reports.length < REPORT_PAGE_SIZE} onClick={() => setOffset(value => value + REPORT_PAGE_SIZE)}>Next page</button></div>
    </div>
    {selected && <ActionDialog report={selected.report} action={selected.action} close={() => setSelected(null)} review={reviewed} />}
  </section>;
}

function ReportCard({ report, chooseAction }: { report: ModerationReport; chooseAction: (action: ModerationAction) => void }) {
  const evidenceName = typeof report.evidence.author_name === "string" ? report.evidence.author_name : "Name not captured";
  const evidenceBody = typeof report.evidence.body === "string" ? report.evidence.body : null;
  return <article className="card-hub min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-2xl text-gold">{report.context === "player" ? "Player report" : report.context === "post" ? "Post report" : "Chat report"}</h2><span className="chip text-xs">{report.status}</span></div>
    <p className="mt-1 break-all text-xs text-muted-foreground">Report {report.id} · {formatDate(report.created_at)}</p>
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Reported player</dt><dd className="break-all">{report.reported_user_id}</dd></div>
      <div><dt className="text-muted-foreground">Reported by</dt><dd className="break-all">{report.reporter_id}</dd></div>
      {report.context_id && <div className="sm:col-span-2"><dt className="text-muted-foreground">Content ID</dt><dd className="break-all">{report.context_id}</dd></div>}
      <div className="sm:col-span-2"><dt className="text-muted-foreground">Reason</dt><dd className="mt-1 whitespace-pre-wrap break-words">{report.reason}</dd></div>
    </dl>
    <section className="mt-4 rounded-xl border border-border bg-background px-4 py-3" aria-label="Evidence snapshot">
      <h3 className="text-sm font-bold text-gold">Evidence at report time</h3>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{evidenceName}</p>
      {evidenceBody !== null ? <blockquote className="mt-2 whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-sm">{evidenceBody}</blockquote> : <p className="mt-2 text-xs text-muted-foreground">No message body captured for this player report.</p>}
      {typeof report.evidence.created_at === "string" && <p className="mt-2 text-xs text-muted-foreground">Content created {formatDate(report.evidence.created_at)}</p>}
      <p className="mt-2 text-xs text-muted-foreground">The snapshot is preserved even if the original content changes.</p>
    </section>
    {report.status !== "pending" && <div className="mt-4 text-sm"><p className="text-muted-foreground">Reviewed {report.resolved_at ? formatDate(report.resolved_at) : ""}{report.resolved_by ? ` by ${report.resolved_by}` : ""}</p>{report.resolution && <p className="mt-1 whitespace-pre-wrap break-words">{report.resolution}</p>}<h3 className="mt-4 font-bold text-gold">Additional actions</h3><p className="mt-1 text-xs text-muted-foreground">Each additional action adds a review history entry. The server checks this report has not changed since you loaded it.</p></div>}
    <div className="mt-4 flex flex-wrap gap-2">{moderationActionsFor(report.context).map(item => <button key={item.action} className="btn-ghost-gold text-sm" onClick={() => chooseAction(item.action)}>{item.label}</button>)}</div>
  </article>;
}

function ActionDialog({ report, action, close, review }: {
  report: ModerationReport;
  action: ModerationAction;
  close: () => void;
  review: (report: ModerationReport, action: ModerationAction, note: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const noteId = useId();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const active = useRef(false);
  const item = moderationActionsFor(report.context).find(candidate => candidate.action === action)!;
  useEffect(() => {
    active.current = true;
    const element = dialog.current;
    element?.showModal();
    return () => { active.current = false; element?.close(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try { await review(report, action, note); }
    catch (cause) { if (active.current) setError(moderationErrorMessage(cause)); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }

  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { if (busy) event.preventDefault(); else close(); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-border bg-background p-5 text-foreground backdrop:bg-black/70">
    <form onSubmit={event => void submit(event)}>
      <h2 id={titleId} className="font-display text-2xl text-gold">{item.label}?</h2>
      <p className="mt-3 text-sm">{item.description}</p>
      <p className="mt-3 break-all text-xs text-muted-foreground">Player: {report.reported_user_id}<br />Report: {report.id}{item.contentOnly && report.context_id ? <><br />Content: {report.context_id}</> : null}</p>
      <p className="mt-3 text-sm text-muted-foreground">{report.status === "pending" ? "This closes the pending report and records your action and note." : "This updates the report and adds your action and note to its review history. Earlier evidence and audit entries are preserved."}</p>
      <label htmlFor={noteId} className="mt-4 block text-sm">Review note</label>
      <textarea id={noteId} value={note} onChange={event => setNote(event.target.value)} minLength={3} maxLength={1000} required rows={4} disabled={busy} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
      <p className="mt-1 text-xs text-muted-foreground">{note.length}/1,000 characters</p>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-3"><button className="btn-gold" disabled={busy || note.trim().length < 3} type="submit">{busy ? "Saving…" : `Confirm ${item.label.toLowerCase()}`}</button><button className="btn-ghost-gold" disabled={busy} type="button" onClick={close}>Cancel</button></div>
    </form>
  </dialog>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unknown time";
}
