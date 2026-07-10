import { useEffect, useState } from "react";

export interface Flight {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  glyph: string;
}

function FlightGhost({ flight, onDone }: { flight: Flight; onDone: (id: string) => void }) {
  const [phase, setPhase] = useState<"start" | "flying" | "landed">("start");

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase("flying"));
    // Fallback in case onTransitionEnd never fires (e.g. from===to, so "left"/"top" never change).
    const fallback = setTimeout(() => onDone(flight.id), 850);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = phase === "start" ? flight.from : flight.to;

  return (
    <div
      onTransitionEnd={(e) => {
        if (e.propertyName === "left" && phase === "flying") {
          setPhase("landed");
          setTimeout(() => onDone(flight.id), 180);
        }
      }}
      className="fixed pointer-events-none z-50 flex items-center justify-center rounded"
      style={{
        left: pos.x,
        top: pos.y,
        width: 20,
        height: 26,
        transform: "translate(-50%, -50%)",
        transition: "left 0.6s cubic-bezier(0.22,0.61,0.36,1), top 0.6s cubic-bezier(0.22,0.61,0.36,1), opacity 0.18s ease",
        opacity: phase === "landed" ? 0 : 1,
        background: `linear-gradient(160deg, ${flight.color}55, ${flight.color}dd)`,
        border: `1.5px solid ${flight.color}`,
        boxShadow: `0 0 10px ${flight.color}aa`
      }}
    >
      <span className="text-[11px] leading-none" style={{ color: "#0b0914" }}>
        {flight.glyph}
      </span>
    </div>
  );
}

export function FlightLayer({ flights, onDone }: { flights: Flight[]; onDone: (id: string) => void }) {
  if (!flights.length) return null;
  return (
    <>
      {flights.map((f) => (
        <FlightGhost key={f.id} flight={f} onDone={onDone} />
      ))}
    </>
  );
}
