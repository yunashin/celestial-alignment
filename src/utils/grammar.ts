import { getLocale } from "../i18n";

// Locales whose target language actually follows the English "a/an" article + trailing "-s"
// plural pattern these helpers implement. Korean has neither articles nor an "-s" plural suffix,
// so applying this logic to Korean text would produce nonsense like "a 불" (article) or a stray
// "s" glued onto a Korean noun (plural) — every locale NOT in this set gets these helpers reduced
// to a no-op instead. Add a locale here only if its grammar genuinely works the same way English's
// does; a language with different pluralization/article rules of its own needs its own logic, not
// membership in this set.
const ENGLISH_STYLE_ARTICLE_PLURAL_LOCALES = new Set(["en"]);

function usesEnglishArticlePluralGrammar(): boolean {
  return ENGLISH_STYLE_ARTICLE_PLURAL_LOCALES.has(getLocale());
}

export function article(label: string, capitalized = false): string {
  if (!usesEnglishArticlePluralGrammar()) return label;
  if (capitalized) return /^[aeiou]/i.test(label) ? `An ${label}` : `A ${label}`;

  return /^[aeiou]/i.test(label) ? `an ${label}` : `a ${label}`;
}

// Returns the English plural suffix (default "s") for any count other than exactly 1, or "" for
// every locale that doesn't pluralize this way (see the set above) — callers should pass this as
// a `{plural}`-style interpolation param rather than hand-rolling `count === 1 ? "" : "s"` inline,
// so the locale check lives in exactly one place.
export function pluralSuffix(count: number, suffix = "s"): string {
  if (!usesEnglishArticlePluralGrammar()) return "";
  return count === 1 ? "" : suffix;
}

export function formatList(items: string[]): string {
  if (items.length < 2) {
    if (items.length === 0) return "";
    return items[0];
  }
  const lastItem = items.slice(items.length - 1);
  const firstItemsIfAny = items.slice(0, items.length - 1);
  return `${firstItemsIfAny.join(", ")} and ${lastItem}`;
}
