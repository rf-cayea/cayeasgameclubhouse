import { useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { economyError, economyRead } from './economy-api';
import type { EconomyView, EconomyWallet } from './economy-protocol';

type ClubhouseUser = { id: string; email?: string };
type Account = { user: ClubhouseUser | null; ready: boolean; error: string | null };
type Rewards = { data: EconomyView | null; wallet: EconomyWallet | null; error: string; loading: boolean };
type Listener = () => void;

const EMPTY_SOURCES: string[] = [];
const EMPTY_REWARDS: Rewards = { data: null, wallet: null, error: '', loading: false };
const WALLET_FRESH_FOR = 15_000;
const DETAILS_FRESH_FOR = 30_000;
const accountListeners = new Set<Listener>();
const rewardListeners = new Set<Listener>();
const detailListeners = new Set<Listener>();
let account: Account = { user: null, ready: !supabase, error: null };
let rewards = EMPTY_REWARDS;
let started = false;
let accountRevision = 0;
let sessionRequest: Promise<void> | undefined;
let walletRequest: { controller: AbortController; result: Promise<void>; detailed: boolean } | undefined;
let walletUpdatedAt = 0;
let detailsUpdatedAt = 0;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

function publishAccount(next: Account) {
  account = next;
  accountListeners.forEach(listener => listener());
}

function publishRewards(next: Rewards) {
  rewards = next;
  rewardListeners.forEach(listener => listener());
  detailListeners.forEach(listener => listener());
}

function cancelWalletRead() {
  walletRequest?.controller.abort();
  walletRequest = undefined;
}

function acceptSession(session: Session | null) {
  const user = session?.user;
  const next = user?.id ? { id: user.id, email: user.email } : null;
  const changed = account.user?.id !== next?.id;
  if (changed) {
    cancelWalletRead();
    walletUpdatedAt = detailsUpdatedAt = 0;
    publishRewards(EMPTY_REWARDS);
  }
  if (changed || account.user?.email !== next?.email || !account.ready || account.error) {
    publishAccount({ user: next, ready: true, error: null });
  }
  if (changed && next && (rewardListeners.size || detailListeners.size)) scheduleWalletRead();
}

export function restoreSession(): Promise<void> {
  if (sessionRequest) return sessionRequest;
  if (!supabase) return Promise.resolve();
  const revision = accountRevision;
  sessionRequest = supabase.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    if (revision === accountRevision) acceptSession(data.session);
  }).catch(() => {
    if (revision === accountRevision) {
      publishAccount({ ...account, ready: true, error: 'The Clubhouse couldn’t reconnect to the account service. Please try again.' });
    }
  }).finally(() => { sessionRequest = undefined; });
  return sessionRequest;
}

function readWallet(detailed: boolean, fresh = false): Promise<void> {
  const owner = account.user?.id;
  const lastRead = detailed ? detailsUpdatedAt : walletUpdatedAt;
  const freshness = detailed ? DETAILS_FRESH_FOR : WALLET_FRESH_FOR;
  if (!owner || fresh && Date.now() - lastRead < freshness) return Promise.resolve();
  if (walletRequest) {
    if (!detailed || walletRequest.detailed) return walletRequest.result;
    return walletRequest.result.then(() => {
      if (account.user?.id === owner && detailListeners.size) return readWallet(true, fresh);
    });
  }
  const controller = new AbortController();
  const current = () => walletRequest?.controller === controller && account.user?.id === owner;
  const path = detailed ? '/api/economy' : '/api/economy/wallet';
  const result = economyRead<EconomyView | { wallet: EconomyWallet }>(path, owner, controller.signal).then(response => {
    if (!current()) return;
    if (!response?.wallet || !Array.isArray(response.wallet.owned)) {
      throw new Error('The reward wallet response could not be verified.');
    }
    const data = 'achievements' in response ? response : rewards.data && { ...rewards.data, wallet: response.wallet };
    if (detailed && (!data || !('achievements' in response))) throw new Error('The rewards response could not be verified.');
    walletUpdatedAt = Date.now();
    if (detailed) detailsUpdatedAt = walletUpdatedAt;
    publishRewards({ data, wallet: response.wallet, error: '', loading: false });
  }).catch(error => {
    if (current()) publishRewards({ ...rewards, error: economyError(error), loading: false });
  }).finally(() => {
    if (current()) walletRequest = undefined;
  });
  walletRequest = { controller, result, detailed };
  publishRewards({ ...rewards, error: '', loading: true });
  return result;
}

function refreshVisibleWallet() {
  if (rewardListeners.size && !rewards.wallet) {
    void readWallet(false, true).then(() => {
      if (detailListeners.size) void readWallet(true, true);
    });
  } else if (detailListeners.size || rewardListeners.size) {
    void readWallet(detailListeners.size > 0, true);
  }
}

function scheduleWalletRead() {
  if (refreshTimer !== undefined) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined;
    refreshVisibleWallet();
  }, 0);
}

function invalidateWallet() {
  walletUpdatedAt = detailsUpdatedAt = 0;
  cancelWalletRead();
  scheduleWalletRead();
}

function start() {
  if (started || !supabase) return;
  started = true;
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION' && !session) {
      // The SDK also emits this event after a failed refresh. Read the result
      // outside the callback so a connection failure cannot clear an account.
      if (!account.ready) setTimeout(() => { if (!account.ready) void restoreSession(); }, 0);
      return;
    }
    if (session || event === 'SIGNED_OUT') {
      ++accountRevision;
      acceptSession(session);
    }
  });
  const reconnect = () => {
    void restoreSession();
    refreshVisibleWallet();
  };
  window.addEventListener('focus', reconnect);
  window.addEventListener('online', reconnect);
  window.addEventListener('clubhouse-wallet', invalidateWallet);
  window.addEventListener('clubhouse-social-changed', invalidateWallet);
  const pollDetails = () => {
    const needsRecovery = rewardListeners.size && (!rewards.wallet || rewards.error);
    if ((detailListeners.size || needsRecovery) && document.visibilityState === 'visible') refreshVisibleWallet();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reconnect();
  });
  setInterval(pollDetails, DETAILS_FRESH_FOR);
  window.addEventListener('storage', event => {
    if (event.key === 'clubhouse-wallet-refresh') invalidateWallet();
  });
}

const getAccount = () => account;
const getRewards = () => rewards;

function subscribeAccount(listener: Listener) {
  accountListeners.add(listener);
  start();
  return () => { accountListeners.delete(listener); };
}

function subscribeRewards(listener: Listener) {
  rewardListeners.add(listener);
  start();
  scheduleWalletRead();
  return () => { rewardListeners.delete(listener); };
}

function subscribeDetails(listener: Listener) {
  detailListeners.add(listener);
  start();
  scheduleWalletRead();
  return () => { detailListeners.delete(listener); };
}

async function reload(detailed = false) {
  if (account.error || !account.ready) await restoreSession();
  await readWallet(detailed);
}
const reloadDetails = () => reload(true);
const reloadWallet = () => reload();

function applyEconomy(owner: string, data: EconomyView | null, wallet = data?.wallet) {
  if (account.user?.id !== owner || !wallet) return;
  // A read started before the confirmed write must not overwrite its balance.
  cancelWalletRead();
  walletUpdatedAt = Date.now();
  detailsUpdatedAt = data ? walletUpdatedAt : 0;
  publishRewards({ data: data ?? (rewards.data && { ...rewards.data, wallet }), wallet, error: '', loading: false });
  scheduleWalletRead();
}

function applyWallet(owner: string, wallet: EconomyWallet) {
  applyEconomy(owner, null, wallet);
}

export function useClubhouseAccount() {
  return useSyncExternalStore(subscribeAccount, getAccount, getAccount);
}

export function useClubhouse() {
  const account = useClubhouseAccount();
  const { wallet, data, error } = useSyncExternalStore(subscribeRewards, getRewards, getRewards);
  return { ...account, wallet, sources: data?.sources ?? EMPTY_SOURCES, humanWinSources: data?.humanWinSources ?? EMPTY_SOURCES,
    error: account.error || error || null, reload: reloadWallet, applyWallet };
}

export function useEconomy(userId: string | null) {
  const account = useClubhouseAccount();
  const rewards = useSyncExternalStore(subscribeDetails, getRewards, getRewards);
  const current = Boolean(userId && account.user?.id === userId);
  return { data: current ? rewards.data : null, error: current ? rewards.error : '', loading: current && rewards.loading,
    refresh: reloadDetails, apply: applyEconomy };
}
