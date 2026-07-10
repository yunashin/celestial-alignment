export function ApPips({ ap, max = 3 }: { ap: number; max?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: Math.max(max, ap) }, (_, i) => i).map((i) => (
        <div
          key={i}
          className="w-3.5 h-3.5 rotate-45 border"
          style={{
            borderColor: "#00ffff",
            background: i < ap ? "#00ffff" : "transparent",
            boxShadow: i < ap ? "0 0 8px #00ffff" : "none"
          }}
        />
      ))}
      <span className="ml-1 text-[10px] tracking-widest uppercase" style={{ color: "#6d5f94" }}>
        AP
      </span>
    </div>
  );
}
