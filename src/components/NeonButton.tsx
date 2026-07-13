import type { CSSProperties, ReactElement } from "react";
import { ApBadge } from "./ApBadge";
import { Tooltip } from "./Tooltip";

export function NeonButton({
  label,
  onClick,
  disabled,
  active,
  urgent,
  color = "#00ffff",
  tooltip,
  apCost
}: {
  label: string | ReactElement;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  urgent?: boolean;
  color?: string;
  tooltip?: string;
  apCost?: number | string;
}) {
  const style = {
    "--glow-c": color,
    borderColor: disabled ? "#3b2d5e" : color,
    color: disabled ? "#4c3f73" : active ? "#0b0914" : color,
    background: active ? color : "rgba(11,9,20,0.6)",
    boxShadow: disabled ? "none" : active ? `0 0 14px ${color}` : `0 0 5px ${color}44`,
    cursor: disabled ? "not-allowed" : "pointer",
    animation: urgent && !disabled ? "caUrgentGlow 1.3s ease-in-out infinite" : undefined
  } as CSSProperties;
  return (
    <Tooltip text={tooltip} side="left">
      <button
        onClick={onClick}
        disabled={disabled}
        className="px-2.5 py-1.5 rounded border text-[9px] md:text-[11.5px] font-bold tracking-widest uppercase transition-all flex items-center gap-1.5"
        style={style}
      >
        {apCost !== undefined && <ApBadge cost={apCost} color={disabled ? "#4c3f73" : active ? "#0b0914" : color} />}
        {label}
      </button>
    </Tooltip>
  );
}
