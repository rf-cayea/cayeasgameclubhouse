import type { CustomProfileAvatar } from './profile-image';
export const PROFILE_AVATARS = ['jade', 'sapphire', 'ruby', 'amber', 'lotus', 'moon'] as const;
export type PresetProfileAvatar = typeof PROFILE_AVATARS[number];
export type ProfileAvatar = PresetProfileAvatar | CustomProfileAvatar;
export type FriendRelationship = 'self' | 'none' | 'incoming' | 'outgoing' | 'friends' | 'blocked';
export interface PlayerProfile {
  userId: string; gamerName: string; bio: string; avatar: ProfileAvatar;
  joinedAt: number; updatedAt: number; nameFlagged: boolean;
  relationship: FriendRelationship; stats: { rummyWins: number; spadesWins: number };
}
export interface FriendsView { friends: PlayerProfile[]; incoming: PlayerProfile[]; outgoing: PlayerProfile[]; blocked: PlayerProfile[] }
export type SocialGame = 'rummy' | 'spades';
export interface WaitingTable { game: SocialGame; code: string; title: string; occupied: number; capacity: number }
export interface GameInvite {
  id: string; sender: PlayerProfile; recipient: PlayerProfile; game: SocialGame; code: string;
  createdAt: number; expiresAt: number; status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  available: boolean; reason: string; href: string;
}
export interface InvitesView { incoming: GameInvite[]; outgoing: GameInvite[]; rooms: WaitingTable[] }
export interface FriendActivity { id: string; game: SocialGame | 'carrom' | 'backgammon' | 'five-dice' | 'farkle' | 'crown-court' | 'dominoes'; player: PlayerProfile; completedAt: string }
export type SocialCommand =
  | { operation: 'profile'; gamerName: string; bio: string; avatar: ProfileAvatar }
  | { operation: 'request' | 'accept' | 'decline' | 'cancel' | 'remove' | 'block' | 'unblock'; targetUserId: string }
  | { operation: 'invite'; targetUserId: string; game: SocialGame; code: string }
  | { operation: 'accept_invite' | 'decline_invite' | 'cancel_invite'; inviteId: string };
export interface SocialCommandResult { ok: true; profile?: PlayerProfile; friends?: FriendsView; invites?: InvitesView; invite?: GameInvite }
