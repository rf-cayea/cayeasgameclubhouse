import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { HubNav } from "@/components/HubNav";
import { PlayerReportProvider, ReportPlayer } from "@/components/ReportPlayer";
import { supabase } from "@/integrations/supabase/client";
import { useClubhouse } from "@/lib/clubhouse";
import { containsProfanity, CLEAN_LANGUAGE_ERROR } from "@/lib/moderation";

export const Route = createFileRoute("/clubhouse")({
  head: () => ({
    meta: [
      { title: "The Clubhouse — Chat, posts & friends | Cayea's Game Clubhouse" },
      { name: "description", content: "Chat with other players, share posts, and see what your friends are winning across Cayea's games." },
      { property: "og:title", content: "The Clubhouse lounge" },
      { property: "og:description", content: "Live chat, player posts and your friends' latest wins." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClubhousePage,
});

interface Msg { id: string; user_id: string; author_name: string; body: string; created_at: string }

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(s)) return "";
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) return String(error.message);
  return "The request failed. Please try again.";
};

const MODERATION_CHANGED = "clubhouse-moderation-changed";
type Client = NonNullable<typeof supabase>;
type Query = (client: Client) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Clear stale identities/content before every moderation refresh, including reconnects.
 * Only show content while its moderation invalidation stream is connected.
 */
function useModeratedQuery<T>(key: string, query: Query, keepWhileChecking = false) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const active = useRef(false);
  const connected = useRef(false);
  const request = useRef(0);
  const clear = useCallback((force = false) => {
    ++request.current;
    if (force || !keepWhileChecking) setData(null);
    setLoading(true);
  }, [keepWhileChecking]);
  const reload = useCallback(async () => {
    const client = supabase;
    if (!active.current || !connected.current || !client) return;
    const current = ++request.current;
    const isCurrent = () => active.current && connected.current && current === request.current;
    try {
      const { data: next, error: failure } = await query(client);
      if (!isCurrent()) return;
      if (failure) throw failure;
      setData(next as T);
      setError("");
    } catch (failure) {
      if (isCurrent()) { setData(null); setError(errorMessage(failure)); }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [query]);
  useEffect(() => {
    active.current = true;
    const client = supabase;
    if (!client) {
      setError("The Clubhouse backend is not configured.");
      setLoading(false);
      return () => { active.current = false; ++request.current; };
    }
    const invalidate = () => {
      if (!active.current) return;
      clear();
      void reload();
    };
    const visibility = () => { if (document.visibilityState === "visible") invalidate(); };
    const channel = client.channel(`lounge-${key}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clubhouse_invalidations" }, invalidate)
      .subscribe((status) => {
        if (!active.current) return;
        if (status === "SUBSCRIBED") {
          connected.current = true;
          setError("");
          invalidate();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          connected.current = false;
          clear(true);
          setLoading(false);
          setError("Live moderation updates are disconnected. Content is hidden until the connection returns.");
        }
      });
    window.addEventListener(MODERATION_CHANGED, invalidate);
    window.addEventListener("focus", invalidate);
    document.addEventListener("visibilitychange", visibility);
    const timer = setInterval(() => void reload(), 10_000);
    return () => {
      active.current = false;
      connected.current = false;
      ++request.current;
      window.removeEventListener(MODERATION_CHANGED, invalidate);
      window.removeEventListener("focus", invalidate);
      document.removeEventListener("visibilitychange", visibility);
      clearInterval(timer);
      void client.removeChannel(channel);
    };
  }, [key, clear, reload]);
  return { data, error, loading, reload };
}

function useLive(kind: "post" | "chat", limit: number) {
  const query = useCallback((client: Client) => client.rpc("lounge_feed", { _kind: kind, _limit: limit }), [kind, limit]);
  const result = useModeratedQuery<Msg[]>(kind, query);
  return { rows: result.data ?? [], error: result.error, loading: result.loading, reload: result.reload };
}

interface LoungePermissions { chat_banned: boolean; muted_until: string | null; name_flagged: boolean }
function useLoungePermissions() {
  const query = useCallback((client: Client) => client.rpc("lounge_permissions"), []);
  // Retain the last permission result during connected checks so editing a
  // local draft keeps keyboard focus. Sending stays paused until revalidated;
  // errors/disconnection still clear access, and the server enforces all writes.
  const result = useModeratedQuery<LoungePermissions>("permissions", query, true);
  const valid = result.data && typeof result.data.chat_banned === "boolean" &&
    (result.data.muted_until === null || typeof result.data.muted_until === "string");
  return { ...result, data: valid ? result.data : null };
}

function ClubhousePage() {
  const { user, ready, error } = useClubhouse();
  const [reportSent, setReportSent] = useState(false);
  useEffect(() => {
    const sent = () => setReportSent(true);
    window.addEventListener("clubhouse-report-submitted", sent);
    return () => window.removeEventListener("clubhouse-report-submitted", sent);
  }, []);
  useEffect(() => { setReportSent(false); }, [user?.id]);
  return (
    <>
      <HubNav />
      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-4 sm:py-10">
        <h1 className="font-display text-4xl text-gold sm:text-5xl">The Clubhouse</h1>
        <p className="mt-2 text-muted-foreground">Chat with other players, share a post, and cheer on your friends.</p>
        {reportSent && <p role="status" className="mt-4 rounded-xl border border-border px-4 py-3 text-gold">Report sent. A moderator can now review its evidence.</p>}
        {!supabase && <p role="status" className="card-hub mt-6">The lounge needs a configured Supabase project before members can sign in, post, or chat.</p>}
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        {!ready ? (
          <p className="mt-6 text-muted-foreground" role="status">Loading your membership…</p>
        ) : !user ? (
          <div className="card-hub mt-6 text-center">
            <p className="text-muted-foreground">The lounge is for members.</p>
            <Link to="/auth" className="btn-gold mt-3 inline-block">Sign in to join the conversation</Link>
          </div>
        ) : (
          <PlayerReportProvider key={user.id}><div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <div className="min-w-0 space-y-4"><Posts key={user.id} me={user.id} /></div>
            <div className="min-w-0 space-y-4"><Chat key={user.id} me={user.id} /><FriendFeed key={user.id} /></div>
          </div></PlayerReportProvider>
        )}
      </main>
    </>
  );
}

function Composer({ max, placeholder, onSend, rows = 3, label, disabled = false, sendDisabled = false }: { max: number; placeholder: string; onSend: (text: string) => Promise<string | null>; rows?: number; label: string; disabled?: boolean; sendDisabled?: boolean }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const send = async () => {
    const value = text.trim();
    if (!value || pending.current || disabled || sendDisabled) return;
    if (containsProfanity(value)) { setError(CLEAN_LANGUAGE_ERROR); return; }
    pending.current = true;
    setBusy(true);
    try {
      const failure = await onSend(value);
      if (!mounted.current) return;
      if (failure) setError(failure);
      else { setError(""); setText(""); }
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <div>
      <textarea value={text} maxLength={max} rows={rows} placeholder={placeholder} aria-label={label} disabled={busy || disabled}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && rows === 1) { event.preventDefault(); void send(); } }}
        className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm" />
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{text.length}/{max}</span>
        <button className="btn-gold text-sm" disabled={busy || disabled || sendDisabled || !text.trim()} onClick={() => void send()}>{busy ? "Sending…" : label}</button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function Posts({ me }: { me: string }) {
  const { rows: posts, error, loading, reload } = useLive("post", 50);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const remove = async (id: string) => {
    if (!supabase || deleting) return;
    setDeleting(id);
    try {
      const { error: failure } = await supabase.from("clubhouse_posts").delete().eq("id", id).eq("user_id", me);
      setDeleteError(failure?.message ?? "");
      if (!failure) await reload();
    } catch (failure) { setDeleteError(errorMessage(failure)); }
    finally { setDeleting(null); }
  };
  const post = async (body: string) => {
    if (!supabase) return "The Clubhouse backend is not configured.";
    const { error: failure } = await supabase.from("clubhouse_posts").insert({ body, user_id: me });
    if (!failure) await reload();
    return failure?.message ?? null;
  };
  return (
    <section className="card-hub">
      <h2 className="font-display text-2xl text-gold">📝 Posts</h2>
      <div className="mt-3"><Composer max={500} placeholder="Share a win, a tip, or say hello…" onSend={post} label="Post" /></div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">Could not load posts: {error}</p>}
      {deleteError && <p role="alert" className="mt-3 text-sm text-destructive">Could not delete post: {deleteError}</p>}
      <ul className="mt-4 space-y-3">
        {loading && <li role="status" className="text-sm text-muted-foreground">Loading posts…</li>}
        {!loading && !error && posts.length === 0 && <li className="text-sm text-muted-foreground">No posts yet — be the first!</li>}
        {posts.map((post) => (
          <li key={post.id} className="rounded-xl bg-secondary p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-bold text-gold">{post.user_id === me ? "You" : (containsProfanity(post.author_name) ? "Player" : post.author_name)}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{ago(post.created_at)}
                {post.user_id === me && <button className="ml-2 underline" disabled={deleting !== null} onClick={() => void remove(post.id)}>{deleting === post.id ? "Deleting…" : "Delete"}</button>}
                {post.user_id !== me && <ReportPlayer userId={post.user_id} name={post.author_name} context="post" contextId={post.id} />}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">{containsProfanity(post.body) ? "[Message hidden]" : post.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Chat({ me }: { me: string }) {
  const { rows: messages, error, loading, reload } = useLive("chat", 60);
  const permissions = useLoungePermissions();
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const mutedUntil = permissions.data?.muted_until ? new Date(permissions.data.muted_until).getTime() : null;
  const muted = mutedUntil !== null && (!Number.isFinite(mutedUntil) || mutedUntil > clock);
  const chatDisabled = !permissions.data || permissions.data.chat_banned || muted;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);
  const send = async (body: string) => {
    if (!supabase) return "The Clubhouse backend is not configured.";
    const { error: failure } = await supabase.from("clubhouse_chat").insert({ body, user_id: me });
    if (!failure) await reload();
    return failure?.message ?? null;
  };
  return (
    <section className="card-hub">
      <h2 className="font-display text-2xl text-gold">💬 Lounge chat</h2>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">Could not load chat: {error}</p>}
      <div className="mt-3 h-72 space-y-2 overflow-y-auto pr-1">
        {loading && <p role="status" className="text-sm text-muted-foreground">Loading chat…</p>}
        {!loading && !error && messages.length === 0 && <p className="text-sm text-muted-foreground">It's quiet in here… say hi!</p>}
        {[...messages].reverse().map((message) => (
          <div key={message.id} className={`flex ${message.user_id === me ? "justify-end" : ""}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${message.user_id === me ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
              {message.user_id !== me && <span className="block text-xs font-bold text-gold">{containsProfanity(message.author_name) ? "Player" : message.author_name}</span>}
              <span className="whitespace-pre-wrap break-words">{containsProfanity(message.body) ? "[Message hidden]" : message.body}</span>
              {message.user_id !== me && <ReportPlayer userId={message.user_id} name={message.author_name} context="chat" contextId={message.id} />}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      {permissions.error && <p role="alert" className="mt-3 text-sm text-destructive">Could not verify chat access: {permissions.error}</p>}
      {permissions.loading && <p role="status" className="mt-3 text-sm text-muted-foreground">Checking chat access…</p>}
      {permissions.data?.chat_banned ? <p role="status" className="mt-3 text-sm text-destructive">Your chat access has been banned.</p> : muted && <p role="status" className="mt-3 text-sm text-destructive">Chat is muted{mutedUntil && Number.isFinite(mutedUntil) ? ` until ${new Date(mutedUntil).toLocaleString()}` : "."}</p>}
      <div className="mt-3"><Composer max={300} rows={1} placeholder="Type a message…" onSend={send} label="Send" disabled={chatDisabled} sendDisabled={permissions.loading} /></div>
    </section>
  );
}

function FriendFeed() {
  return (
    <section className="card-hub">
      <h2 className="font-display text-2xl text-gold">🎉 Friends' activity</h2>
      <p className="mt-3 text-sm text-muted-foreground">Friend activity will be available when friend connections are ready. <Link to="/friends" className="text-gold underline">View friends</Link></p>
    </section>
  );
}
