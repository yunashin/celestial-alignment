export const GLOBAL_CSS = `
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
