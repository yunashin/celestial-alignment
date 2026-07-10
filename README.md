# 🌌 Celestial Alignment

A cooperative-ish, pass-and-play strategy game for 2–4 players. Each player is a Zodiac Guardian tied to one of four elements (Fire, Water, Earth, Air) and must build a connected line of Star Cards from their element's edge node, across a 19×11 board, into the center Orrery — before the shared Eclipse Tracker hits 100%.

Built with Vite + React + TypeScript + Tailwind CSS. See [CLAUDE.md](CLAUDE.md) for an architecture map and implementation notes aimed at whoever (human or agent) picks this up next.

## Running & Deployment

```
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # preview the production build locally
```

The source lives under `src/` (types, constants, `engine/` for pure game logic, `components/` for UI), entered via `main.tsx`.

**GitHub Pages:** `.github/workflows/deploy.yml` builds and deploys `dist/` to Pages on every push to `main`. `vite.config.ts` sets `base: "/celestial-alignment/"` for production builds so asset paths resolve correctly at `https://yunashin.github.io/celestial-alignment/`. After pushing this repo to GitHub as `celestial-alignment`, enable **Settings → Pages → Source → GitHub Actions** once; the workflow handles the rest on subsequent pushes.

## Design Aesthetic (Y2K / Cosmic Retro-Futurism)

- **Palette:** deep space void (`#0b0914`), neon accents — Fire magenta `#ff00ff`, Water blue `#3d7cff`, Earth emerald `#3dd68c`, Air silver `#e2e8f0`. Each element's color is a single named constant in `src/constants.ts` (`FIRE_COLOR`/`WATER_COLOR`/`EARTH_COLOR`/`AIR_COLOR`), so retuning one is a one-line change.
- **UI vibes:** glowing neon borders, pixelated starfield, holographic card wrappers, arcade-cabinet tracker bar.
- **Juice:** pulsing highlights, a staggered "sweep" animation and color gradient when a path completes, glitch effects on corruption.

## The Board

A 19×11 grid, regenerated every game. The **Orrery** (the shared win target) spawns somewhere in the center 7×5 tiles, and the 4 **element nodes** (Air-north, Earth-south, Fire-east, Water-west) each land at a random spot along their edge — all 4 the same distance from the Orrery, and always at least 4 tiles apart from each other, so the board never plays out quite the same way twice and no two nodes ever crowd the same corner. Every Guardian actually in the game also spawns in its own distinct quadrant of the board relative to the Orrery, not just its own edge — so with fewer than 4 players, it's not enough for two nodes to merely sit far apart; they land on genuinely different sides of the board. Each node's name is labeled outside the board, tracking its actual position along that edge, and each Guardian spawns standing on their own node — since two players can never share an element (the setup screen won't let you start otherwise), no two Guardians ever share a spawn tile either. 14 tiles are **Asteroids** (impassable, unbuildable) and 4 are **Shooting Stars** (💫) — see Power-Ups below — both scattered away from the Orrery/nodes. A node has up to 3 in-bounds neighboring tiles (the 4th direction always runs off the board), and your first Star Card can be placed on any of them, not just the one leading straight to the Orrery.

An existing asteroid breaks loose and hurtles in a straight line to a random spot at least 3 tiles away every 4 turns in a 2-player game, every 5 in a 3-player game, or every 6 in a 4-player game — nullifying any card, corruption, or lock along its path and dealing 1 damage to any Guardian standing in the way (Cancer's shield still protects against it). It can't land on a tile a Guardian is currently standing on, and it can't destroy a Shooting Star, anything on/adjacent to a Cancer Guardian (their Lunar Shield radius is now shown directly on the board with a soft blue glow), an enclosed Star Card (see below), or a tile shielded by Virgo's Protective Precision. It never destroys a path that's already complete into the Orrery, and every tile it touches gets its own log line; cards it does destroy are sent to the discard pile rather than vanishing outright.

**Closed loops:** whenever your Star Cards' connectors close a loop — a rectangle is the simplest shape, but any enclosed area counts — every card that helped form it becomes permanently immune to Eclipse Corruption and the traveling asteroid, marked with a small amber ring and a 🔒. Breaking the loop later (say, an asteroid destroys a different card that used to complete it) doesn't strip immunity already earned.

## Turn Structure (3 AP per turn, +bonuses)

Each player has a hand of 4 cards (5 for Gemini) and spends Action Points on:

- **Move (1 AP per tile):** step along connected tiles whose connectors actually line up — a node, the Orrery, or a card that genuinely connects (physically touching a card whose connector shape doesn't face you doesn't count). Standing on a node, the Orrery, or a bare tile (e.g. your own card was just destroyed by an asteroid) lets you step off in any direction instead. With enough AP, click a tile several steps away to walk the whole distance in one click instead of re-clicking Move between every single step — every tile more than 1 step away shows a small badge with its exact AP cost, and every tile you pass through along the way still counts as personally visited (relevant for Purify, below).
- **Place a Star Card (1 AP, 2 AP for a tile more than 1 step from your pawn):** play a card onto an empty tile, provided its connectors link back to an existing path from *some* element's node (or directly to a node/the Orrery) — connectivity now tolerates corrupted cards along the way, so you can keep building through scorched ground (a corrupted tile just keeps that specific element from *winning* until it's purified again). If an asteroid ever severs your path into a disconnected island, you can still build onto that stranded fragment — being cut off from the network doesn't make it permanently unbuildable. Aquarius may manually rotate the card through all 4 orientations before placing (auto-picks the first valid one otherwise). Sagittarius (Astral Arrow) ignores the normal 1-tile range entirely and may place anywhere adjacent to the connected network their pawn is currently standing on, at the same 1/2 AP split — only tiles you can currently afford (1 AP vs. 2 AP) are highlighted as selectable, and each Sagittarius-only 2-AP tile shows a small badge marking the extra cost. A hand card grays out and becomes unselectable the moment it has nowhere affordable left to go on the board — most often the whole hand at 0 AP, but for Sagittarius a single card can gray out on its own if all of its valid targets happen to be 2-AP-away tiles you can no longer afford.
- **Purify (1 AP anywhere, free for Taurus's first use/turn):** cleanse a corrupted tile — but only one you've personally walked onto via Move (see [CLAUDE.md](CLAUDE.md) for why this is path-based rather than network-based). A purified tile can never be corrupted again — its card renders a touch lighter with a faint pale ring to show it's permanently protected — unless the traveling asteroid later destroys that card outright, in which case a fresh card placed there starts unprotected. Purifying keeps the button armed as long as another corrupted tile is still available and affordable, so cleaning up several in a row doesn't need a re-click between each one.

**Corruption decays:** a corrupted card doesn't stay seized forever — a countdown ticks down at the end of each of whichever Guardian originally placed that specific card's own turns, and once it hits 0 (after 3 of the placer's own turns) the card crumbles to dust right then (with its own dissolving-to-dust animation, distinct from the asteroid's explosion), outright, whether or not anyone ever purified it. The number shown centered on the card (right where its `✖` used to sit) is the TOTAL turn count until it disappears — counting every Guardian's turns, not just the placer's — since that's what actually tells you "how long do I have left to react"; hover it for a tooltip breaking out both that total and the placer's own remaining-turn count specifically. If the placer never personally walked onto that tile (placing a card there doesn't count — see Purify above), the tooltip also flags that they specifically can't be the one to purify it. Purifying resets the clock entirely — a purified card is permanently safe, per the bullet above.
- **Cosmic Draw (1 AP, free first use/turn for Libra):** ditch any number of hand cards and redraw to full.
- **Protective Precision (1 AP, once per turn, Virgo only):** shield a 2x2 area anywhere on the board from all Eclipse effects and the traveling asteroid; disabled again on your next turn, available the turn after that.
- **Discard to Heal (free, once per turn, Scorpio only):** discard a hand card to heal any Guardian (including yourself) 1 HP.
- **Terraform Hand (1 AP, repeatable, Capricorn only):** turn every card currently in your hand into an Earth card.

Ending your turn while you still have a usable action prompts a quick "are you sure?" confirmation. At end of turn: hand refills for free, then one Eclipse card resolves automatically (Corruption seizes a card of a given element and damages anyone standing there, Void spawns a permanent black hole, or Surge spikes the tracker directly, scaled up modestly by existing corruption). A Corruption/Void card that finds no legal target still nudges the tracker up a little rather than doing nothing. Turn passes to the next non-Stasis player; a Guardian in Stasis reboots at 1 HP if an ally ends a turn adjacent to them.

If Purify is greyed out, hover it — the tooltip explains exactly why (no corrupted tile you've walked onto yet, or not enough AP for the cheapest one available). While in Purify mode, only tiles you can actually afford right now are highlighted on the board — none will light up if you're out of AP.

Every AP-cost action button shows a small diamond badge with its cost (or a range, like Purify's "1-2") instead of spelling it out in the label.

**Chains:** the first time a connected run of 3+ SAME-element Star Cards forms, the Eclipse Tracker eases by 5% (10% if that element is your own) — extending an already-long chain further doesn't retrigger the discount, though it still re-plays the animation/log line each time. Corruption along the way doesn't disqualify anything — a corrupted card still has its physical connector shape, so it doesn't sever an otherwise-continuous same-element chain. Chains are purely single-element now; a physically-bridged card of a different element simply isn't part of the chain at all. The log line for a qualifying chain includes both its start and end coordinates, and every card in it glows for 3 seconds so it's obvious at a glance which run of cards just triggered.

**Win:** every element in play (2–4 depending on player count) has a complete, uncorrupted path from its node to the Orrery. Corruption doesn't cut a path's connectivity, so partially-corrupted networks can keep growing — but a path only counts as *complete* once it both reaches the Orrery and has zero corrupted tiles anywhere in it. This purity check only looks at your own element's actual path, though — the Orrery itself never counts as part of it, so a corrupted card on a *different* element's path (one that merely happens to reach the Orrery from another side) can never keep your own genuinely complete, pure path from counting as a win. The completed paths animate with a color sweep from each node's color, blending where paths converge before reaching the Orrery. In a 4-player game specifically — which needs 4 separate completed paths instead of 2-3 — completing any one path also eases the Eclipse Tracker by 10%, and every Eclipse card's tracker effect is 30% gentler, to offset the extra distance.

**Loss:** the Eclipse Tracker hits 100%, or every Guardian is in Stasis at once. The loss screen has a ✕ in the corner to dismiss it without resetting, so you can scroll back through the log to see how the run ended.

## Power-Ups: Shooting Stars

4 tiles are seeded at game start, one per board quadrant relative to the Orrery (kept away from the central cross of nodes/paths, more than 2 tiles from any element node, and — for whichever Guardian's own node shares that quadrant — roughly a 12-15 tile detour away via the Orrery, so it's a worthwhile side-trip rather than a razor-thin shortcut or a trek across the whole map). Since every Guardian spawns in their own distinct quadrant (see the Board section above), that detour rule is always scoped to exactly one player's own star — never satisfied by sharing a star with someone else. Each star secretly holds one power-up:

- **Tracker Ease:** Eclipse Tracker −20%, immediately.
- **Surge of Vigor:** +1 AP per turn, permanently, for every Guardian.
- **Overflowing Hands:** +1 hand size, permanently, for every Guardian.
- **Quiet Rest:** unlocks self-healing, permanently, for every Guardian — end a turn with no other action taken while below full HP to restore 1 HP.

In a 2-3 player game, the first three power-ups above are preferentially seeded into whichever quadrant holds an active player's own element node, so a beneficial power-up is more likely to turn up somewhere convenient rather than wasted on a corner nobody's path goes near. In a 4-player game, every element is in play, so all 4 power-ups are placed with no preference at all.

Placing *any* valid Star Card onto a shooting-star tile activates its power-up on the spot (placement is only ever legal when the card connects to a live path, so "a path reaches it" is automatic), shimmers once, and the star disappears — the card stays. The UI element the power-up actually affects (the Eclipse Tracker bar, your AP pips, or the hand panel) briefly glows gold too, so it's obvious what just changed. Quiet Rest instead flashes the restored HP hearts themselves the moment someone actually rests.

## Decks & Discard

The Star Deck, Eclipse Deck, and discard pile each get a small icon with a live count above the board. Drawing, discarding, an Eclipse card resolving, a deck reshuffling from its discard pile, and asteroid-destroyed cards all play a brief animation of a card flying between the relevant pile/tile/hand.

- **Star Deck (60 cards):** 15 per element, a mix of straights, corners, T-junctions and crossroads.
- **Eclipse Deck (28 cards):** 12 Corruption (3 per element), 6 Void, 6 Surge, 4 Damage — Void only ever opens a black hole on a genuinely empty tile, never on top of a Shooting Star. Damage cards hit every Guardian of specific element(s) directly for a set amount of HP (Cancer's Lunar Shield still applies) rather than picking a random tile/target — in a 2-3 player game, cards targeting an element with no active player are excluded from the deck entirely.

## Quick Replay

The setup screen remembers the names and signs you last used for each player count (2/3/4 Guardians) in your browser's local storage, so picking up a repeat match-up is one click instead of re-entering everyone every time.

## Board Seeds

The setup screen has an optional "Board Seed" field — leave it blank for a random board, or type anything to get a reproducible one. Once a game starts, that seed is shown next to the turn counter with a tap-to-copy button, so if you land on an interesting (or particularly brutal) board, you can share or replay the exact same starting layout: Orrery/node positions, asteroids, Shooting Stars, and the initial card order. It reproduces the *starting board* only, not a full turn-by-turn replay — everything that happens once you start playing (deck reshuffles, which Eclipse card comes up, where the asteroid shifts to) is still randomized independently each time.

Whatever you last typed into the Board Seed field is remembered and prefilled next time you visit the setup screen. There's also a ☆ button next to the field to save the current seed as a favorite — favorites get a nickname (click ✎ to rename one), can be tapped to reload that seed into the field, and removed with ✕. All of this lives in the same browser local storage as the remembered player names/signs above.

## Difficulty Tuning

Every constant that meaningfully affects how hard or how fast-paced a game feels — Eclipse Tracker pacing (deck composition, per-card tracker bumps, the 4-player balance breaks), starting HP/AP/hand size, hazard damage (Corruption/Void/asteroid all deal the same configurable amount), corruption decay length, the chain discount's length threshold and reward, asteroid count/frequency, and shooting star count/spacing/node-distance/payoff sizes — lives together in one clearly-labeled block at the top of [`src/constants.ts`](src/constants.ts). If a game feels too punishing or too easy, that's the file to open: tweak a value, run a few games, repeat. Per-sign ability numbers (Scorpio's heal amount, Virgo's shield cooldown, etc.) are deliberately left out of that block — they're character balance, not overall pacing, and stay inline near each ability in `SIGNS`/`reducer.ts` instead.

## Zodiac Guardians

| Sign | Element | Ability | Effect |
| --- | --- | --- | --- |
| Aries | 🔥 Fire | Vanguard | First card placed each turn costs 0 AP if it's closer to the Orrery than you are. |
| Leo | 🔥 Fire | Solar Flare | Purify also cleanses every corrupted tile along the connected card path between you and the purified tile. |
| Sagittarius | 🔥 Fire | Astral Arrow | May place Star Cards anywhere connecting to the path you're currently on (1 AP adjacent to you, 2 AP elsewhere on it). |
| Cancer | 💧 Water | Lunar Shield | Guardians on or adjacent to your tile take no damage; the radius is shown on the board. |
| Scorpio | 💧 Water | Regeneration | Once per turn, discard a hand card to heal any Guardian 1 HP. |
| Pisces | 💧 Water | Dream Walk | Cosmic Draw heals up to 2 HP per discard action. |
| Gemini | 💨 Air | Twin Paradox | Hand size 5. |
| Libra | 💨 Air | Cosmic Balance | First Cosmic Draw each turn costs 0 AP. |
| Aquarius | 💨 Air | Rebel Wave | Preview and manually rotate a Star Card through all 4 orientations before placing it. |
| Taurus | ⛰️ Earth | Rooted Form | First Purify each turn costs 0 AP, anywhere you've walked. |
| Virgo | ⛰️ Earth | Protective Precision | Once per turn, shield a 2x2 area from all Eclipse effects and the traveling asteroid (disabled your next turn, ready the turn after). |
| Capricorn | ⛰️ Earth | Terraform | 1 AP: turn every card in your hand into an Earth card. |

## Testing

`npm test` runs the Vitest suite (`npm run test:watch` for watch mode) — pure engine-logic tests under `src/engine/` plus the seeded-RNG utility tests under `src/utils/`, covering connectivity/purity rules, the same-element chain discount, corruption decay, multi-tile Move's per-tile cost and AP budget, per-Guardian abilities, asteroid behavior, shooting star placement/power-up prioritization, the Quiet Rest self-heal, and seeded-board reproducibility. No UI/component tests; those are verified by hand in a browser.
