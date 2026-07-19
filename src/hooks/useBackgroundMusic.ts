import { useEffect, useRef } from "react";
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
const VOLUME = 0.25;

type Mode = "playlist" | "urgent1" | "urgent2";

/** Eclipse Tracker band → music mode. ">= 75" is checked before ">= 50" so the two bands ("50-75%"
 * and "75% or higher") don't overlap — a tracker sitting exactly at 75 always reads as the more
 * urgent band. */
function modeForTracker(tracker: number): Mode {
  if (tracker >= 80) return "urgent2";
  if (tracker >= 60) return "urgent1";
  return "playlist";
}

/** Background music for the lifetime of a game (mount → unmount — GameScreen only exists while
 * `state.phase !== "setup"`, see App.tsx's own setup/game screen switch, so this hook's own
 * mount/unmount cleanly tracks "a game is in progress," continuing through the win/loss screen
 * until the player actually clicks Back). CASong1-4 play back-to-back on loop as an ordinary
 * playlist at a reasonable low volume; whenever the Eclipse Tracker crosses into the 50-75% or
 * 75%+ band, playback switches to a single looping "urgent" track instead (CAUrgentSong1 /
 * CAUrgentSong2), reverting to the playlist (resuming from whichever track was current when the
 * game got urgent, restarted from its own beginning — not exactly where it left off, which needs
 * no more precision than that for background music) once the tracker drops back below 50%.
 *
 * A single shared HTMLAudioElement carries every track rather than layering multiple `<audio>`
 * tags — only one track is ever meant to be audible at a time, so there's nothing to layer. */
export function useBackgroundMusic(tracker: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const modeRef = useRef<Mode>("playlist");
  const playlistIndexRef = useRef(0);

  useEffect(() => {
    const audio = new Audio();
    audio.volume = VOLUME;
    audio.loop = false;
    audioRef.current = audio;

    // Browsers refuse to start audio before a genuine user gesture on the page. The game already
    // requires clicking Start (a real gesture) right before GameScreen mounts, so playback usually
    // succeeds immediately — but if the browser is stricter than that (or this is a hot-reload in
    // dev with no fresh gesture), `play()` rejects; queue a one-shot retry on the next real
    // pointer/keyboard interaction, which the browser will always honor.
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
}
