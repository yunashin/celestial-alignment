import type { Connections } from "../types";

const DIR_POINTS: Record<string, [number, number]> = {
  top: [50, 2],
  right: [98, 50],
  bottom: [50, 98],
  left: [2, 50]
};

export function CardGlyph({ connections, color, lit, dim }: { connections: Connections; color: string; lit?: boolean; dim?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      style={{
        filter: `drop-shadow(0 0 ${lit ? 7 : 3}px ${color})`,
        opacity: dim ? 0.4 : 1
      }}
    >
      {(["top", "right", "bottom", "left"] as const).filter((d) => connections[d]).map((d) => (
        <line
          key={d}
          x1={50}
          y1={50}
          x2={DIR_POINTS[d][0]}
          y2={DIR_POINTS[d][1]}
          stroke={color}
          strokeWidth={lit ? 15 : 11}
          strokeLinecap="round"
        />
      ))}
      <circle cx={50} cy={50} r={lit ? 14 : 11} fill={color} />
    </svg>
  );
}
