interface BlockedPlayer {
  memberNumber: number;
  reason: string;
  blockedAt: number;
}

interface ShieldState {
  enabled: boolean;
  mode: 'silent' | 'alert' | 'block';
  blockList: BlockedPlayer[];
  allowFriends: boolean;
}

const SHIELD_KEY = 'rp_mod_shield_state';

export function getShieldState(): ShieldState {
  const raw = localStorage.getItem(SHIELD_KEY);
  if (!raw) return { enabled: true, mode: 'alert', blockList: [], allowFriends: false };
  return JSON.parse(raw);
}

export function saveShieldState(state: ShieldState) {
  localStorage.setItem(SHIELD_KEY, JSON.stringify(state));
}

export function addToBlockList(memberNumber: number, reason = 'Попытка вмешательства') {
  const state = getShieldState();
  if (state.blockList.find(b => b.memberNumber === memberNumber)) return;
  state.blockList.push({ memberNumber, reason, blockedAt: Date.now() });
  saveShieldState(state);
}

export function isBlocked(memberNumber: number): boolean {
  const state = getShieldState();
  return state.blockList.some(b => b.memberNumber === memberNumber);
}
