import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";

interface ReportTarget {
  userId: string;
  context: "post" | "chat" | "player";
  contextId?: string;
}

const ReportController = createContext<((target: ReportTarget) => void) | null>(null);

/** Keep a report draft outside live feed rows, which disappear during invalidation. */
export function PlayerReportProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ReportTarget | null>(null);
  const open = useCallback((next: ReportTarget) => setTarget(next), []);
  return <ReportController.Provider value={open}>
    {children}
    {target && <ReportDialog key={`${target.userId}:${target.context}:${target.contextId ?? ""}`} target={target} close={() => setTarget(null)} />}
  </ReportController.Provider>;
}

export function ReportPlayer({ name, ...target }: ReportTarget & { name: string }) {
  const open = useContext(ReportController);
  return <button className="ml-2 underline" disabled={!open} aria-label={`Report ${name}`} onClick={() => open?.(target)}>Report</button>;
}

function ReportDialog({ target: { userId, context, contextId }, close }: { target: ReportTarget; close: () => void }) {
  const reasonId = useId();
  const titleId = useId();
  const targetId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportContext, setReportContext] = useState(context);
  const pending = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || pending.current || reason.trim().length < 3) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      // The server verifies the target and captures immutable evidence from its
      // own content/profile records; browser-provided snapshots are not trusted.
      const { error: insertError } = await supabase.rpc("submit_player_report", {
        _reported_user_id: userId,
        _context: reportContext,
        _context_id: reportContext === "player" ? null : contextId ?? null,
        _reason: reason.trim(),
      });
      if (insertError) throw insertError;
      // Keep the confirmation outside the dialog so closing it or refreshing
      // the reported content cannot erase the submission result.
      window.dispatchEvent(new Event("clubhouse-report-submitted"));
      if (!mounted.current) return;
      close();
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : typeof cause === "object" && cause !== null && "message" in cause ? String(cause.message) : "Could not send your report. Please try again.");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    createPortal(
        <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { if (busy) event.preventDefault(); else close(); }}
          className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-background p-5 text-foreground backdrop:bg-black/70">
        <form onSubmit={(event) => void submit(event)}>
          <h2 id={titleId} className="mb-3 font-display text-xl text-gold">Report a player</h2>
          <label htmlFor={targetId} className="block text-sm">Report about</label>
          <select id={targetId} value={reportContext} disabled={busy} onChange={(event) => setReportContext(event.target.value as typeof context)} className="my-2 w-full rounded-lg border border-border bg-background p-2 text-sm">
            {context !== "player" && <option value={context}>This {context === "post" ? "post" : "chat message"}</option>}
            <option value="player">Player / display name</option>
          </select>
          <label htmlFor={reasonId} className="block text-sm">Why are you reporting this player?</label>
          <textarea id={reasonId} required minLength={3} maxLength={500} rows={3} value={reason}
            onChange={(event) => setReason(event.target.value)} disabled={busy}
            className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-sm" />
          <span className="mt-2 flex gap-2">
            <button type="submit" className="btn-gold text-xs" disabled={!supabase || busy || reason.trim().length < 3}>{busy ? "Sending…" : "Send report"}</button>
            <button type="button" className="underline" disabled={busy} onClick={close}>Cancel</button>
          </span>
          {error && <span role="alert" className="mt-2 block text-sm text-destructive">{error}</span>}
        </form>
        </dialog>, document.body,
      )
  );
}
