function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** `#rrggbb` + alpha -> `rgba(r,g,b,a)`, no spaces (matches the format the codebase already
 * hand-typed everywhere) — lets ELEMENT_META's `soft` backgrounds be derived straight from the
 * same hex constant as `color` instead of a separately hand-computed rgba string that could
 * silently drift out of sync whenever the color itself changes. */
export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function lerpColor(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const clamped = Math.max(0, Math.min(1, t));
  return rgbToHex([
    ca[0] + (cb[0] - ca[0]) * clamped,
    ca[1] + (cb[1] - ca[1]) * clamped,
    ca[2] + (cb[2] - ca[2]) * clamped
  ]);
}

export function averageColors(colors: string[]): string {
  if (colors.length === 1) return colors[0];
  const sum = colors.reduce(
    (acc, c) => {
      const rgb = hexToRgb(c);
      return [acc[0] + rgb[0], acc[1] + rgb[1], acc[2] + rgb[2]] as [number, number, number];
    },
    [0, 0, 0] as [number, number, number]
  );
  return rgbToHex([sum[0] / colors.length, sum[1] / colors.length, sum[2] / colors.length]);
}
