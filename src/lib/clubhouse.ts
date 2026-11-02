import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const HUB_NAME = "Cayea's Game Clubhouse";

/** Points for clearing a Faith 3 level the first time. Grows every 20 levels. */
export const levelPoints = (level: number) => 5 + Math.floor(level / 20);
/** Points for claiming an in-game Faith 3 milestone. */
export const MILESTONE_POINTS = 25;

export interface Game {
  slug: string;
  name: string;
  tagline: string;
  status: "live" | "soon";
  icon: string;
}

export const GAMES: Game[] = [
  { slug: "faith-3", name: "Faith 3 Tile Match", tagline: "280 levels across ten world beliefs, including 80 mahjong-style layouts.", status: "live", icon: "🕊" },
  { slug: "rummy", name: "Cayea's Classic Cards Rummy+", tagline: "Classic, Gin and Rummy 500 — vs computer, online, or on one device.", status: "live", icon: "🃏" },
  { slug: "spades", name: "Cayea’s Classic Cards Spades", tagline: "Four players. Solo rivals or 2 vs 2 partners. Bid, play, and collect your own table and deck.", status: "live", icon: "♠" },
  { slug: "3-gems", name: "3 Gems of Buddhism", tagline: "150 match-three levels. Create special gems, earn boosters, and restore a temple to reopen the monastery.", status: "live", icon: "🪷" },
];

export interface Wallet {
  points: number;
  f3_points: number;
  rummy_points: number;
  spades_points?: number;
  lifetime_points: number;
  owned: string[];
  equipped: Record<string, string>;
  pending_perks: Record<string, number>;
}

export interface HubStats {
  lifetime: number;
  cosmetics: number;
  f3Levels: number;
  f3Milestones: number;
  rummyWins: number;
  rummyHumanWins: number;
}

export interface Badge {
  id: string;
  name: string;
  desc: string;
  stat: keyof HubStats;
  goal: number;
  points: number;
}

export const BADGES: Badge[] = [
  { id: "first-points", name: "Welcome In", desc: "Earn your first points in any game", stat: "lifetime", goal: 10, points: 10 },
  { id: "pts-500", name: "Regular", desc: "Earn 500 lifetime points", stat: "lifetime", goal: 500, points: 50 },
  { id: "pts-2000", name: "Clubhouse Legend", desc: "Earn 2,000 lifetime points", stat: "lifetime", goal: 2000, points: 150 },
  { id: "style-1", name: "New Look", desc: "Own 1 cosmetic", stat: "cosmetics", goal: 1, points: 25 },
  { id: "style-3", name: "Collector", desc: "Own 3 cosmetics", stat: "cosmetics", goal: 3, points: 75 },
  { id: "f3-10", name: "Pilgrim", desc: "Clear 10 Faith 3 levels", stat: "f3Levels", goal: 10, points: 50 },
  { id: "f3-50", name: "Devoted", desc: "Clear 50 Faith 3 levels", stat: "f3Levels", goal: 50, points: 150 },
  { id: "f3-200", name: "Enlightened", desc: "Clear the original 200 Faith 3 levels", stat: "f3Levels", goal: 200, points: 500 },
  { id: "f3-ms-5", name: "Milestone Hunter", desc: "Claim 5 Faith 3 milestones", stat: "f3Milestones", goal: 5, points: 75 },
  { id: "rummy-100", name: "Rummy+ Centurion", desc: "Win 100 verified Rummy+ games", stat: "rummyWins", goal: 100, points: 500 },
  ...[
    [1, 5, "First Rival"], [3, 7, "Table Challenger"], [5, 10, "Friendly Competition"],
    [10, 15, "Rising Rival"], [15, 20, "Table Regular"], [25, 25, "Seasoned Competitor"],
    [40, 35, "Card Contender"], [60, 45, "Table Champion"], [80, 55, "Rival Master"],
    [100, 70, "Multiplayer Centurion"], [150, 90, "Clubhouse All-Star"], [200, 120, "Rummy+ Rival Legend"],
  ].map(([goal, points, name]): Badge => ({
    id: `rummy-pvp-${goal}`,
    name: String(name),
    desc: `Win ${goal} online Rummy+ ${goal === 1 ? "game" : "games"} against real players`,
    stat: "rummyHumanWins",
    goal: Number(goal),
    points: Number(points),
  })),
];

export function hubStats(w: Wallet | null, sources: string[], cosmeticIds: string[], humanWinSources: string[] = []): HubStats {
  return {
    lifetime: w?.lifetime_points ?? 0,
    cosmetics: (w?.owned ?? []).filter((id) => cosmeticIds.includes(id)).length,
    f3Levels: sources.filter((s) => s.startsWith("faith3:level:")).length,
    f3Milestones: sources.filter((s) => s.startsWith("faith3:ms:")).length,
    rummyWins: sources.filter((s) => s.startsWith("rummy:win:")).length,
    rummyHumanWins: new Set(humanWinSources.filter((s) => s.startsWith("rummy:win:") && sources.includes(s))).size,
  };
}

export const SKIN_SLOT = "faith3_skin";
/** Owned forever: unlimited Shuffles in Faith 3 (server allows it when verifying wins). */
export const INFINITY_SHUFFLE = "f3-infinity-shuffle";

const EVT = "clubhouse-wallet";
/** Each game's own points. They buy only that game's items, or convert to Clubhouse Cash. */
export const GAME_POINTS = {
  "faith-3": { name: "Faith 3 points", short: "F3 pts", icon: "🙏", key: "f3_points" },
  rummy: { name: "Rummy+ points", short: "Rummy pts", icon: "🃏", key: "rummy_points" },
  spades: { name: "Spades points", short: "Spades pts", icon: "♠", key: "spades_points" },
} as const;
export type PointGame = keyof typeof GAME_POINTS;
/** Conversion: every 10 game points become 7 Clubhouse Cash (you keep 70%). */
export const CASH_PER_10 = 7;
export const cashFor = (gamePoints: number) => Math.floor(gamePoints / 10) * CASH_PER_10;
export const notifyWallet = () => {
  window.dispatchEvent(new Event(EVT));
  try { localStorage.setItem('clubhouse-wallet-refresh', crypto.randomUUID()); } catch { /* Cross-tab refresh is optional in private browsing. */ }
};

export async function awardPoints(source: string, amount: number) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.rpc("award_points", { _source: source, _amount: amount });
    if (error) return false;
    notifyWallet();
    return true;
  } catch {
    return false;
  }
}

type ClubhouseUser = { id: string; email?: string | undefined };

export function useClubhouse() {
  const [user, setUser] = useState<ClubhouseUser | null>(null);
  const [ready, setReady] = useState(false);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [humanWinSources, setHumanWinSources] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const request = useRef(0);
  const currentUserId = useRef<string | null>(null);

  const clearWallet = useCallback(() => {
    setWallet(null);
    setSources([]);
    setHumanWinSources([]);
  }, []);

  const load = useCallback(async () => {
    const version = ++request.current;
    const active = () => mounted.current && request.current === version;
    const client = supabase;
    if (!active()) return;
    setError(null);
    if (!client) {
      currentUserId.current = null;
      setUser(null);
      clearWallet();
      setReady(true);
      return;
    }

    let verifiedUser: ClubhouseUser | null = null;
    try {
      // A missing local session is the normal signed-out state, not a backend error.
      const { data: session, error: sessionError } = await client.auth.getSession();
      if (!active()) return;
      if (sessionError) throw sessionError;
      if (!session.session) {
        currentUserId.current = null;
        setUser(null);
        clearWallet();
        return;
      }

      const { data: identity, error: identityError } = await client.auth.getUser();
      if (!active()) return;
      if (identityError) throw identityError;
      if (!identity.user) throw new Error("Your session could not be verified. Please sign in again.");
      verifiedUser = { id: identity.user.id, email: identity.user.email };
      if (currentUserId.current !== verifiedUser.id) clearWallet();
      currentUserId.current = verifiedUser.id;
      setUser(verifiedUser);

      const [walletResult, awardsResult] = await Promise.all([
        client.from("wallets")
          .select("points, f3_points, rummy_points, spades_points, lifetime_points, owned, equipped, pending_perks")
          .eq("user_id", verifiedUser.id).maybeSingle(),
        client.from("point_awards").select("source, rummy_tier").eq("user_id", verifiedUser.id),
      ]);
      if (!active()) return;
      if (walletResult.error) throw walletResult.error;
      if (awardsResult.error) throw awardsResult.error;
      setWallet((walletResult.data as Wallet | null) ?? {
        points: 0, f3_points: 0, rummy_points: 0, spades_points: 0, lifetime_points: 0,
        owned: [], equipped: {}, pending_perks: {},
      });
      const awards = (awardsResult.data ?? []) as { source: string; rummy_tier: string | null }[];
      setSources(awards.map((row) => row.source));
      setHumanWinSources(awards.filter((row) => row.rummy_tier === "humans").map((row) => row.source));
    } catch (cause) {
      if (!active()) return;
      currentUserId.current = verifiedUser?.id ?? null;
      setUser(verifiedUser);
      clearWallet();
      setError(cause instanceof Error ? cause.message : (
        typeof cause === "object" && cause !== null && "message" in cause
          ? String(cause.message) : "Unable to load Clubhouse account data. Please try again."
      ));
    } finally {
      if (active()) setReady(true);
    }
  }, [clearWallet]);

  useEffect(() => {
    mounted.current = true;
    void load();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const subscription = supabase?.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        ++request.current;
        currentUserId.current = null;
        setUser(null);
        clearWallet();
        setError(null);
        setReady(true);
        return;
      }
      if (session?.user.id && session.user.id !== currentUserId.current) {
        ++request.current;
        currentUserId.current = null;
        setUser(null);
        clearWallet();
        setReady(false);
      }
      // Supabase holds its auth lock inside this callback. Defer further auth calls.
      const timer = setTimeout(() => { timers.delete(timer); void load(); }, 0);
      timers.add(timer);
    });
    const refresh = () => { void load(); };
    window.addEventListener(EVT, refresh);
    const stored = (event: StorageEvent) => { if (event.key === 'clubhouse-wallet-refresh') refresh(); };
    window.addEventListener('storage', stored);
    window.addEventListener('focus', refresh);
    return () => {
      mounted.current = false;
      ++request.current;
      subscription?.data.subscription.unsubscribe();
      for (const timer of timers) clearTimeout(timer);
      window.removeEventListener(EVT, refresh);
      window.removeEventListener('storage', stored);
      window.removeEventListener('focus', refresh);
    };
  }, [clearWallet, load]);

  return { user, ready, wallet, sources, humanWinSources, reload: load, error };
}
