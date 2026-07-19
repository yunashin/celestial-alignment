import { useSyncExternalStore } from "react";

/** The 4 top-level pages the app can be on — see App.tsx's own route switch. "home" is the bare
 * root (`/celestial-alignment`, or `/` in dev); the other three each get their own path segment. */
export type Route = "home" | "play" | "how-to-play" | "settings";

const ROUTE_SEGMENTS: Record<Route, string> = {
  home: "",
  play: "play",
  "how-to-play": "how-to-play",
  settings: "settings"
};

/** `import.meta.env.BASE_URL` is "/celestial-alignment/" in a production build (see vite.config.ts's
 * `base`, set for GitHub Pages) and "/" in dev — stripping it off `location.pathname` yields just
 * the route segment regardless of which one the app is currently served under, so the rest of this
 * module never needs to know about the subpath. */
function currentSegment(): string {
  const base = import.meta.env.BASE_URL;
  let path = window.location.pathname;
  if (path.startsWith(base)) path = path.slice(base.length);
  return path.replace(/^\/+|\/+$/g, "");
}

function resolveRoute(segment: string): Route {
  const entry = (Object.entries(ROUTE_SEGMENTS) as [Route, string][]).find(([, s]) => s === segment);
  return entry ? entry[0] : "home";
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot(): Route {
  return resolveRoute(currentSegment());
}

// A single shared listener drives every subscriber (mirrors i18n/index.ts's own locale-store
// pattern) — the browser's own back/forward buttons fire "popstate" directly, `navigate()` below
// notifies the same way after a pushState so both paths funnel through one place.
window.addEventListener("popstate", notify);

/** Pushes a new history entry for `route` and re-renders every `useRoute()` subscriber. A no-op if
 * already on that route (e.g. clicking "Play" while already on `/play`) — pushState would otherwise
 * add a redundant back-stack entry for a navigation that didn't actually go anywhere. */
export function navigate(route: Route) {
  const path = import.meta.env.BASE_URL + ROUTE_SEGMENTS[route];
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
  notify();
}

/** Re-renders the calling component whenever the route changes, via pushState/navigate() above or
 * the browser's own back/forward buttons. */
export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getSnapshot);
}
