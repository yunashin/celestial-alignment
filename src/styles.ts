export const GLOBAL_CSS = `
/* Belt-and-suspenders against accidental horizontal scroll on mobile (a vertical swipe
   occasionally "catching" sideways drift) — App.tsx's own root div also gets overflow-x-hidden/
   touch-pan-y/overscroll-x-none directly, but html/body need this too since they're a SEPARATE
   scrollable box any stray overflow-causing element (now or added later) could scroll within,
   outside App's own container.
   background matches STARFIELD's own solid base color (#0b0914, see below) so the sliver of page
   exposed during a mobile browser's elastic rubber-band bounce past the top/bottom — which sits
   BEHIND every element on the page, including position: fixed ones, since it's the browser's own
   viewport background, not any CSS box — reads as more of the same starfield instead of a jarring
   flash of the browser's default white.
   overscroll-behavior-y: none is NOT set unconditionally here — that was tried and reverted:
   setting it to "none" on html/body (the actual ROOT scroller, not an intermediate one) suppressed
   ALL wheel-driven scrolling of the page in Chromium, not just the bounce past the boundary — a
   real regression, not a hypothetical, confirmed by disabling it live and watching scroll work
   again. Scoped below to @media (pointer: coarse) instead — devices whose PRIMARY pointer is a
   finger/stylus rather than a mouse/trackpad, i.e. real phones/tablets, not a desktop browser
   resized to a phone-sized viewport (DevTools' device emulation still reports pointer: fine there,
   which is exactly why the original bug reproduced on desktop but not in an emulated iPhone SE
   viewport) — matching overscroll-behavior's own actual design purpose (suppressing pull-to-
   refresh/scroll-chaining on touch swipes) instead of applying it somewhere its Chromium
   implementation turns out to have this side effect for wheel input. */
html, body {
  overflow-x: hidden;
  overscroll-behavior-x: none;
  max-width: 100%;
  background: #0b0914;
}
@media (pointer: coarse) {
  html, body {
    overscroll-behavior-y: none;
  }
}
/* Keeps a scroll container's scroll POSITION and wheel/touch/keyboard scrollability fully intact —
   only the visible scrollbar track/thumb is suppressed. Used on the TOP PANE (board + header),
   which now scrolls at every breakpoint (see GameScreen's own doc comment on that div) — a visible
   scrollbar there competed for space against the board/edge labels and read as UI chrome rather
   than a deliberate feature, unlike the right sidebar's scrollbar which sits in an obviously
   list-like panel. scrollbar-width: none (Firefox) plus -ms-overflow-style: none (legacy Edge) are
   plain properties; the ::-webkit-scrollbar pseudo-element rule below is the Chromium/Safari
   equivalent — between the three this covers every engine actually in use. NOTE: this whole file is
   a JS template literal (see the backtick that opens GLOBAL_CSS above) — never use a backtick
   character in a comment anywhere in this file, it silently terminates the string early. */
.ca-hide-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.ca-hide-scrollbar::-webkit-scrollbar {
  display: none;
}
@keyframes caPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
@keyframes caSpin { to { transform: rotate(360deg); } }
@keyframes caFlow { 0% { background-position: 0% 50%; } 100% { background-position: 300% 50%; } }
@keyframes caGlitch {
  0%,100% { transform: translate(0,0); }
  25% { transform: translate(-1px,1px); }
  50% { transform: translate(1px,-1px); }
  75% { transform: translate(-1px,-1px); }
}
@keyframes caUrgentGlow {
  0%, 100% { box-shadow: 0 0 6px var(--glow-c), 0 0 2px var(--glow-c); }
  50% { box-shadow: 0 0 22px var(--glow-c), 0 0 40px var(--glow-c); }
}
@keyframes caWinSweep {
  0% { filter: brightness(2.6) saturate(1.6); }
  60% { filter: brightness(1.35) saturate(1.2); }
  100% { filter: brightness(1) saturate(1); }
}
@keyframes caStarShimmer {
  0% { opacity: 0; transform: scale(0.4); }
  40% { opacity: 1; transform: scale(1.5); }
  100% { opacity: 0; transform: scale(2); }
}
@keyframes caAsteroidHit {
  0% { opacity: 0; transform: scale(0.3) rotate(0deg); }
  30% { opacity: 1; transform: scale(1.3) rotate(20deg); }
  100% { opacity: 0; transform: scale(1.8) rotate(40deg); }
}
@keyframes caStarFlash {
  0% { box-shadow: 0 0 0px transparent; }
  25% { box-shadow: 0 0 22px #ffd166, 0 0 44px #ffd16688; }
  100% { box-shadow: 0 0 0px transparent; }
}
@keyframes caDeckShuffle {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-6deg); }
  75% { transform: rotate(6deg); }
}
@keyframes caShieldBlock {
  0%, 100% { box-shadow: 0 0 0px transparent; }
  30% { box-shadow: 0 0 16px #5eb3ff, 0 0 30px #5eb3ff88; }
}
@keyframes caChainGlow {
  0%, 100% { box-shadow: 0 0 10px #fde047, 0 0 4px #fde047; }
  50% { box-shadow: 0 0 26px #fde047, 0 0 50px #fde047aa; }
}
/* Corrupted-tile border pulse — same box-shadow-pulse shape as caChainGlow above, but purple and
   slower with a brief hold at its peak (45%-55%, rather than a single instantaneous 50% peak) so
   it reads as an eerie "breathing"/flicker-hold rather than a smooth, mechanical chain-glow pulse. */
@keyframes caCorruptionPulse {
  0%, 100% { box-shadow: inset 0 0 6px #a855f799, 0 0 4px #7c3aed66; border-color: #a855f766; }
  45%, 55% { box-shadow: inset 0 0 16px #c084fcdd, 0 0 14px #a855f7bb; border-color: #c084fccc; }
}
@keyframes caCursorPulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
@keyframes caExplosionFlash {
  0% { opacity: 0; transform: scale(0.2); filter: brightness(1); }
  15% { opacity: 1; transform: scale(1.15); filter: brightness(2.4); }
  45% { opacity: 0.9; transform: scale(1.4); filter: brightness(1.6); }
  100% { opacity: 0; transform: scale(1.9); filter: brightness(1); }
}
@keyframes caExplosionRing {
  0% { opacity: 0.9; transform: scale(0.3); border-width: 5px; }
  100% { opacity: 0; transform: scale(2.8); border-width: 0px; }
}
@keyframes caExplosionDebris {
  0% { opacity: 1; transform: translate(0, 0) rotate(0deg) scale(1); }
  100% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(200deg) scale(0.3); }
}
@keyframes caElementSurgeFlash {
  0% { opacity: 0; transform: scale(0.5); }
  35% { opacity: 1; transform: scale(1.3); }
  100% { opacity: 0; transform: scale(2); }
}
@keyframes caElementSurgeRing {
  0% { opacity: 0.8; transform: scale(0.4); border-width: 4px; }
  100% { opacity: 0; transform: scale(2.2); border-width: 0px; }
}
@keyframes caCrumbleFlash {
  0% { opacity: 0; transform: scale(1); filter: brightness(1) saturate(1); }
  20% { opacity: 0.9; transform: scale(1.05); filter: brightness(1.3) saturate(1.3); }
  100% { opacity: 0; transform: scale(0.55); filter: brightness(0.3) saturate(0.2); }
}
@keyframes caCrumbleDust {
  0% { opacity: 0.9; transform: translate(0, 0) scale(1); }
  100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0.15); }
}
/* Low-HP screen-edge flash — an FPS-style "you're about to die" damage indicator. Pulses fast
   (1.1s, vs. the corrupted-tile pulse's slow 2.2s "eerie" feel above) to read as urgent rather than
   ambient. Opacity-only (not box-shadow like the tile pulses) since this animates a full-viewport
   radial-gradient overlay, not a bordered box. */
@keyframes caLowHpPulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.85; }
}
@keyframes caHeartRestore {
  0%, 100% { transform: scale(1); text-shadow: 0 0 6px #ff5f9e; }
  35% { transform: scale(1.4); text-shadow: 0 0 20px #ff5f9e, 0 0 36px #ff5f9eaa; }
}
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
`;

export const STARFIELD = {
  background: "radial-gradient(circle at 50% 0%, rgba(124,58,237,0.18), transparent 55%),#0b0914"
};
