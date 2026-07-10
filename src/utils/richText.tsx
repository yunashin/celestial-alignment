import type { ReactNode } from "react";

// Turns a translated string's `<b>...</b>` markers into real <strong> elements, so YAML prose can
// bold a key term inline (`"Purify a <b>corrupted</b> Star Card..."`) without fragmenting a
// paragraph into a separate translation key per emphasized word. Deliberately NOT
// dangerouslySetInnerHTML + arbitrary HTML — translations are static, developer-authored content
// today, but parsing only this one specific tag means there's no injection surface to reason about
// even if that ever changes, and no risk of a stray unclosed tag corrupting the whole page's DOM.
// Only use this where the caller is rendering the result as JSX children — `t()` itself still
// returns a plain string everywhere else (tooltips, aria-labels, log lines baked into GameState),
// since those contexts can't render elements at all.
export function boldify(text: string): ReactNode {
  const parts = text.split(/(<b>.*?<\/b>)/g);
  return parts.map((part, i) => {
    const match = part.match(/^<b>(.*)<\/b>$/);
    return match ? <strong key={i}>{match[1]}</strong> : part;
  });
}
