import { useEffect, useRef, useSyncExternalStore } from "react";
import { useSettings } from "../utils/settings";
import song1 from "../assets/music/CASong1.mp3";
import song2 from "../assets/music/CASong2.mp3";
import song3 from "../assets/music/CASong3.mp3";
import song4 from "../assets/music/CASong4.mp3";
import song5 from "../assets/music/CASong5.mp3";
import song6 from "../assets/music/CASong6.mp3";
import song7 from "../assets/music/CASong7.mp3";
import song8 from "../assets/music/CASong8.mp3";
import urgentSong1 from "../assets/music/CAUrgentSong1.mp3";
import urgentSong2 from "../assets/music/CAUrgentSong2.mp3";

const PLAYLIST = [song5, song3, song6, song4, song7, song1, song2, song8];

type Mode = "playlist" | "urgent1" | "urgent2";

/** Eclipse Tracker band → music mode. ">= 75" is checked before ">= 50" so the two bands ("50-75%"
 * and "75% or higher") don't overlap — a tracker sitting exactly at 75 always reads as the more
 * urgent band. `null` (no game currently mounted — see reportGameTracker below) reads as the calm
 * playlist band, same as an actual tracker of 0. */
function modeForTracker(tracker: number | null): Mode {
  if (tracker === null) return "playlist";
  if (tracker >= 80) return "urgent2";
  if (tracker >= 60) return "urgent1";
  return "playlist";
}

// GameScreen owns the actual Eclipse Tracker value (inside PlayScreen's own useGameEngine()
// instance), but the music itself is mounted once at the App level so it plays continuously across
// every route AND survives a game starting/ending/restarting without ever being torn down (see
// useBackgroundMusic's own doc comment for why that matters). This tiny external store is the
// bridge between the two: GameScreen calls reportGameTracker on every tracker change (and reports
// null on unmount, once no game is on screen to drive "urgent" mode at all), the App-level hook
// instance subscribes via useSyncExternalStore. Same plain-store shape as utils/settings.ts.
let sharedTracker: number | null = null;
const trackerListeners = new Set<() => void>();

/** Call from GameScreen with the live `state.tracker` while mounted, and with `null` on unmount
 * (leaving the game entirely, e.g. via Back) — see the module doc comment above. */
export function reportGameTracker(value: number | null) {
  sharedTracker = value;
  trackerListeners.forEach((fn) => fn());
}

function subscribeTracker(fn: () => void): () => void {
  trackerListeners.add(fn);
  return () => trackerListeners.delete(fn);
}

function getTrackerSnapshot(): number | null {
  return sharedTracker;
}

/** Background music for the lifetime of the whole app — mounted exactly once, at the App level
 * (see App.tsx), NOT tied to any single route or to GameScreen's own mount/unmount. This is
 * deliberate: music should keep playing across every page (Home, Play, How to Play, Settings) and
 * must NOT restart when a player starts a new game — since this hook instance never tears down for
 * either of those transitions, the single shared <audio> element just keeps going uninterrupted.
 * CASong1-8 play back-to-back on loop as an ordinary playlist at a reasonable low volume; whenever
 * the Eclipse Tracker (reported by GameScreen via reportGameTracker, see above — null while no game
 * is mounted) crosses into the 60-80% or 80%+ band, playback switches to a single looping "urgent"
 * track instead (CAUrgentSong1 / CAUrgentSong2), reverting to the playlist (resuming from whichever
 * track was current when the game got urgent, restarted from its own beginning — not exactly where
 * it left off, which needs no more precision than that for background music) once the tracker drops
 * back below 60% or the game ends/is left entirely.
 *
 * A single shared HTMLAudioElement carries every track rather than layering multiple `<audio>`
 * tags — only one track is ever meant to be audible at a time, so there's nothing to layer.
 *
 * Volume comes from the Settings screen (utils/settings.ts), read reactively via useSettings() so
 * a change there applies live to whatever's already playing rather than needing a restart. */
export function useBackgroundMusic() {
  const { musicVolume } = useSettings();
  const tracker = useSyncExternalStore(subscribeTracker, getTrackerSnapshot);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const modeRef = useRef<Mode>("playlist");
  const playlistIndexRef = useRef(0);

  useEffect(() => {
    const audio = new Audio();
    audio.volume = musicVolume;
    audio.loop = false;
    audioRef.current = audio;

    // Browsers refuse to start audio before a genuine user gesture on the page — loading the site
    // alone doesn't count, so this almost always rejects on the very first mount; queue a one-shot
    // retry on the next real pointer/keyboard interaction ANYWHERE in the app (clicking Play, How
    // to Play, Settings, or literally any button), which the browser will always honor.
    let clearRetry: (() => void) | null = null;
    const attemptPlay = () => {
      audio.play().catch(() => {
        clearRetry?.();
        const retry = () => attemptPlay();
        window.addEventListener("pointerdown", retry, { once: true });
        window.addEventListener("keydown", retry, { once: true });
        clearRetry = () => {
          window.removeEventListener("pointerdown", retry);
          window.removeEventListener("keydown", retry);
        };
      });
    };

    const advancePlaylist = () => {
      playlistIndexRef.current = (playlistIndexRef.current + 1) % PLAYLIST.length;
      audio.src = PLAYLIST[playlistIndexRef.current];
      attemptPlay();
    };
    audio.addEventListener("ended", advancePlaylist);

    audio.src = PLAYLIST[playlistIndexRef.current];
    attemptPlay();

    return () => {
      audio.removeEventListener("ended", advancePlaylist);
      clearRetry?.();
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switches track the moment the Eclipse Tracker crosses a band boundary — deliberately keyed off
  // the DERIVED mode (modeRef), not the raw tracker value, so a re-render where the tracker changes
  // but stays within the same band doesn't restart whatever's currently playing. On the very first
  // render this runs right after the mount effect above (same commit, declaration order), sees
  // `modeForTracker(tracker) === "playlist" === modeRef.current`'s own initial value, and no-ops —
  // the mount effect already started the playlist, this doesn't need to redo that.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const mode = modeForTracker(tracker);
    if (mode === modeRef.current) return;
    modeRef.current = mode;
    if (mode === "urgent1") {
      audio.loop = true;
      audio.src = urgentSong1;
      audio.play().catch(() => { });
    } else if (mode === "urgent2") {
      audio.loop = true;
      audio.src = urgentSong2;
      audio.play().catch(() => { });
    } else {
      audio.loop = false;
      audio.src = PLAYLIST[playlistIndexRef.current];
      audio.play().catch(() => { });
    }
  }, [tracker]);

  // Keeps volume in sync with the live Settings value — separate from the mount effect (which only
  // sets the INITIAL volume once, at audio-element creation time) so dragging the slider on the
  // Settings screen changes what's already playing immediately, without restarting the track.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = musicVolume;
  }, [musicVolume]);
}
