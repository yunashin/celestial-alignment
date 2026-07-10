import { getLocale } from "../i18n";

// Locales whose target language actually follows the English "a/an" article + trailing "-s"
// plural pattern these helpers implement. Korean has neither articles nor an "-s" plural suffix,
// so applying this logic to Korean text would produce nonsense like "a 불" (article) or a stray
// "s" glued onto a Korean noun (plural) — every locale NOT in this set gets these helpers reduced
// to a no-op instead. Add a locale here only if its grammar genuinely works the same way English's
// does; a language with different pluralization/article rules of its own needs its own logic, not
// membership in this set.
const ENGLISH_STYLE_ARTICLE_PLURAL_LOCALES = new Set(["en"]);

// Defaults to the reactive global locale, but callers that already have an explicit locale value
// in hand (e.g. `formatList`, threaded through from `initGame`'s own `locale` param) should pass
// it here instead of relying on the global — see `getTranslatedAnd` below for why that matters.
function usesEnglishArticlePluralGrammar(locale: string = getLocale()): boolean {
  return ENGLISH_STYLE_ARTICLE_PLURAL_LOCALES.has(locale);
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

// Determines if a Korean character has a final consonant (받침, batchim), which affects
// which article is used in certain cases
export function hasBatchim(char: string): boolean {
  const code = char.charCodeAt(0);

  // Check if the character is a precomposed Hangul syllable (가 ~ 힣)
  if (code < 0xAC00 || code > 0xD7A3) {
    return false;
  }

  // Calculate the remainder of the character's index divided by 28
  // 28 is the number of possible final consonant states (including "no final consonant")
  return (code - 0xAC00) % 28 > 0;
}

function getIfEndsWithVowel(word: string): boolean {
  return /[aeiou]$/i.test(word);
}

function isKorean(char: string): boolean {
  return /\p{sc=Hangul}/u.test(char);
}

// In Korean, 와 follows words that end in vowels because 과 is used for words with a batchim (consonant).
function getTranslatedAnd(locale: string, prevWord?: string): string {
  if (usesEnglishArticlePluralGrammar(locale) || !prevWord) return ' and';

  const lastCharacter = prevWord[prevWord.length - 1];
  if (isKorean(lastCharacter)) {
    return hasBatchim(lastCharacter) ? '과' : '와';
  }
  return getIfEndsWithVowel(prevWord) ? '와' : '과';
}

// Korean subject/topic particle (이/가) selection depends on whether the preceding word's LAST
// syllable has a batchim — not its first. Must extract the last character before checking, same
// as `getTranslatedAnd` above; passing the whole word to `hasBatchim` would check the wrong
// syllable's batchim for any multi-syllable name whose first and last syllables disagree.
export function getKoreanArticle(prevWord: string): string {
  const lastCharacter = prevWord[prevWord.length - 1] ?? "";
  if (isKorean(lastCharacter)) {
    return hasBatchim(lastCharacter) ? '이' : '가';
  }
  return getIfEndsWithVowel(prevWord) ? '가' : '이';
}

export function formatList(items: string[], locale: string = getLocale()): string {
  if (items.length < 2) {
    if (items.length === 0) return "";
    return items[0];
  }
  const lastItem = items.slice(items.length - 1);
  const firstItemsIfAny = items.slice(0, items.length - 1);
  return `${firstItemsIfAny.join(", ")}${getTranslatedAnd(locale, items[items.length - 2])} ${lastItem}`;
}
