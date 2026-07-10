import { useTranslation } from "../i18n";

export function EclipseTracker({ value }: { value: number }) {
  const { t } = useTranslation();
  const critical = value >= 70;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className={`text-[12px] font-bold tracking-widest uppercase`} style={{ color: "#c084fc" }}>
          ☽ {t("gameScreen.eclipseTracker")}
        </span>
        <span
          className="text-sm font-bold"
          style={{
            color: critical ? "#ff00ff" : "#00ffff",
            textShadow: `0 0 8px ${critical ? "#ff00ff" : "#00ffff"}`,
            animation: critical ? "caPulse 0.8s ease-in-out infinite" : undefined
          }}
        >
          {Math.round(value)}%
        </span>
      </div>
      <div
        className="relative h-5 rounded-full overflow-hidden border"
        style={{ borderColor: "#ff00ff55", background: "#140d24", boxShadow: "inset 0 0 10px rgba(255,0,255,0.2)" }}
      >
        <div
          className="h-full transition-all duration-700"
          style={{
            width: `${value}%`,
            background: "linear-gradient(90deg, #00ffff, #ff00ff, #7c3aed, #00ffff)",
            backgroundSize: "300% 100%",
            animation: "caFlow 3s linear infinite",
            boxShadow: "0 0 14px #ff00ffaa"
          }}
        />
        <div className="absolute inset-0 flex">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex-1 border-r" style={{ borderColor: "rgba(11,9,20,0.6)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
