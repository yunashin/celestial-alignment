import type { PlayerSetup } from "../types";

const SETUPS_KEY = "celestial-alignment:last-setups";
const COUNT_KEY = "celestial-alignment:last-count";
const LAST_SEED_KEY = "celestial-alignment:last-seed";
const FAVORITE_SEEDS_KEY = "celestial-alignment:favorite-seeds";

type StoredSetups = Partial<Record<number, PlayerSetup[]>>;

export interface FavoriteSeed {
  id: string;
  seed: string;
  nickname: string;
}

/** All storage here is best-effort — a disabled/unavailable localStorage (private browsing,
 * embedded iframe, etc.) should never break setup, just silently skip persistence. */
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function loadLastSetups(): StoredSetups {
  const raw = safeGet(SETUPS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as StoredSetups;
  } catch {
    return {};
  }
}

export function loadLastCount(): 2 | 3 | 4 | null {
  const raw = safeGet(COUNT_KEY);
  const n = raw ? Number(raw) : NaN;
  return [2, 3, 4].includes(n) ? n as (2 | 3 | 4) : null;
}

/** Called once a game actually starts, so "last played" reflects real replays, not every edit. */
export function saveLastSetup(count: number, setup: PlayerSetup[]) {
  const all = loadLastSetups();
  all[count] = setup;
  safeSet(SETUPS_KEY, JSON.stringify(all));
  safeSet(COUNT_KEY, String(count));
}

/** Whatever the player last typed into the Board Seed field (including blank, for "random") —
 * prefilled on the next visit to the setup screen, same spirit as loadLastSetups above but for the
 * seed field specifically. Saved on every game start, not just when a favorite is involved. */
export function loadLastSeed(): string {
  return safeGet(LAST_SEED_KEY) ?? "";
}

export function saveLastSeed(seed: string) {
  safeSet(LAST_SEED_KEY, seed);
}

export function loadFavoriteSeeds(): FavoriteSeed[] {
  const raw = safeGet(FAVORITE_SEEDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFavoriteSeeds(list: FavoriteSeed[]) {
  safeSet(FAVORITE_SEEDS_KEY, JSON.stringify(list));
}

export function addFavoriteSeed(seed: string): FavoriteSeed[] {
  const list = loadFavoriteSeeds();
  if (list.some((f) => f.seed === seed)) return list; // already saved — no duplicates
  const entry: FavoriteSeed = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, seed, nickname: seed };
  const next = [...list, entry];
  saveFavoriteSeeds(next);
  return next;
}

export function removeFavoriteSeed(id: string): FavoriteSeed[] {
  const next = loadFavoriteSeeds().filter((f) => f.id !== id);
  saveFavoriteSeeds(next);
  return next;
}

export function renameFavoriteSeed(id: string, nickname: string): FavoriteSeed[] {
  const next = loadFavoriteSeeds().map((f) => (f.id === id ? { ...f, nickname: nickname.trim() || f.seed } : f));
  saveFavoriteSeeds(next);
  return next;
}
