import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CONVERSION_RATE, puzzleLevelPoints, type EconomyWallet } from "./economy-protocol";
export { ACHIEVEMENTS as BADGES } from "./achievement-catalog";

export const HUB_NAME = "Cayea's Game Clubhouse";

/** The shared server reward schedule also drives the displayed first-clear reward. */
export const levelPoints = (level: number) => puzzleLevelPoints('faith-3', level);

export interface Game {
  slug: string;
  name: string;
  tagline: string;
  status: "live" | "soon";
  icon: string;
}

export const GAMES: Game[] = [
  { slug: "five-dice", name: "Farkle", tagline: "Three computer difficulties, free two-player online tables, and unlockable three- or four-player party tables.", status: "live", icon: "🎲" },
  { slug: "faith-3", name: "Faith 3 Tile Match", tagline: "280 levels across ten world beliefs, including 80 mahjong-style layouts.", status: "live", icon: "🕊" },
  { slug: "rummy", name: "Cayea's Classic Cards Rummy+", tagline: "Classic, Gin and Rummy 500 — vs computer, online, or on one device.", status: "live", icon: "🃏" },
  { slug: "spades", name: "Cayea’s Classic Cards Spades", tagline: "Four players. Solo rivals or 2 vs 2 partners. Bid, play, and collect your own table and deck.", status: "live", icon: "♠" },
  { slug: "3-gems", name: "3 Gems of Buddhism", tagline: "200 match-three levels. Restore four monasteries and grow their villages, 50 levels each.", status: "live", icon: "🪷" },
];

export type Wallet = EconomyWallet;

export const SKIN_SLOT = "faith3_skin";
/** Owned forever: unlimited Shuffles in Faith 3 (server allows it when verifying wins). */
export const INFINITY_SHUFFLE = "f3-infinity-shuffle";

const EVT = "clubhouse-wallet";
/** Each game's own points. They buy only that game's items, or convert to Clubhouse Cash. */
export const GAME_POINTS = {
  "3-gems": { name: "3 Gems points", short: "Gems pts", icon: "🪷", key: "gems_points" },
  "faith-3": { name: "Faith 3 points", short: "F3 pts", icon: "🙏", key: "f3_points" },
  rummy: { name: "Rummy+ points", short: "Rummy pts", icon: "🃏", key: "rummy_points" },
  "five-dice": { name: "Farkle points", short: "Farkle pts", icon: "⚄", key: "dice_points" },
  spades: { name: "Spades points", short: "Spades pts", icon: "♠", key: "spades_points" },
} as const;
export type PointGame = keyof typeof GAME_POINTS;
/** One Clubhouse Cash is worth 30% more than one game point. */
export const cashFor = (gamePoints: number) => Math.floor(gamePoints / CONVERSION_RATE.points) * CONVERSION_RATE.cash;
export const notifyWallet = () => {
  window.dispatchEvent(new Event(EVT));
  try { localStorage.setItem('clubhouse-wallet-refresh', crypto.randomUUID()); } catch { /* Cross-tab refresh is optional in private browsing. */ }
};


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

      const response = await fetch('/api/economy', { credentials: 'same-origin', headers: { Authorization: `Bearer ${session.session.access_token}` }, signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!active()) return;
      if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'Your reward wallet could not load. Please retry.');
      if (!result?.wallet || !Array.isArray(result.sources) || !Array.isArray(result.humanWinSources)) throw new Error('The reward wallet response could not be verified.');
      setWallet(result.wallet as Wallet);
      setSources(result.sources);
      setHumanWinSources(result.humanWinSources);
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

  const applyWallet = useCallback((ownerId: string, confirmed: Wallet) => {
    if (!mounted.current || currentUserId.current !== ownerId) return;
    ++request.current; // An older refresh must not overwrite a confirmed mutation.
    setWallet(confirmed); setError(null); setReady(true);
  }, []);
  return { user, ready, wallet, sources, humanWinSources, reload: load, applyWallet, error };
}
