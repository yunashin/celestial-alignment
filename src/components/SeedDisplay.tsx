import { useState, type CSSProperties } from "react";
import { Tooltip } from "./Tooltip";
import { BODY_FONT_SIZE } from "../constants";
import { useTranslation } from "../i18n";

/** Shows the current game's board seed with a tap-to-copy affordance — lets a player note down or
 * share the seed to replay this exact starting board later (see initGame's seed handling). */
export function SeedDisplay({
  seed,
  className,
  style,
  side
}: {
  seed: string;
  className?: string;
  style?: CSSProperties;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(seed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard access denied/unavailable — silently ignore, nothing to fall back to here
    }
  };
  return (
    // `className`/`style` (positioning + the badge look some callers opt into, e.g. GameScreen's
    // header uses a bordered/padded variant) belong on the Tooltip wrapper, not the button — see
    // Tooltip's own doc comment on why wrapping an already-positioned element works this way.
    <Tooltip
      className={className ?? "relative inline-flex"}
      style={{ color: "#6d5f94", ...style }}
      text={t("seedDisplay.copyTooltip")}
      side={side}
    >
      <button onClick={copy} className={`sm:text-base md:text-[${BODY_FONT_SIZE}] tracking-widest uppercase`}>
        {copied ? t("seedDisplay.copiedLabel") : t("seedDisplay.seedLabel", { seed })}
      </button>
    </Tooltip>
  );
}
