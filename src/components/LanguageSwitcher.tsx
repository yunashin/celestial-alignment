import { LANGUAGES, useTranslation } from "../i18n";

/** A small English/한국어 (etc.) toggle — adding a future language only requires a new entry in
 * `LANGUAGES` (see src/i18n/index.ts's own doc comment); this component doesn't need to change. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useTranslation();
  return (
    <div className={className ?? "flex gap-1"}>
      {LANGUAGES.map((lang) => {
        const active = locale === lang.code;
        return (
          <button
            key={lang.code}
            type="button"
            onClick={() => setLocale(lang.code)}
            aria-pressed={active}
            className="px-2 py-1 rounded border text-[10px] font-bold tracking-widest uppercase"
            style={{
              borderColor: active ? "#5eb3ff" : "#3b2d5e",
              color: active ? "#0b0914" : "#a99cd4",
              background: active ? "#5eb3ff" : "transparent",
              boxShadow: active ? "0 0 8px #5eb3ff88" : "none"
            }}
          >
            {lang.nativeLabel}
          </button>
        );
      })}
    </div>
  );
}
