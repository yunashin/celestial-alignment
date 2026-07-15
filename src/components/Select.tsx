import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Tooltip } from "./Tooltip";

const EDGE_MARGIN = 28;
const GAP = 4;
const MIN_LIST_HEIGHT = 200;
const MAX_LIST_HEIGHT = 320;

export interface SelectOption<T extends string> {
  value: T;
  label: ReactNode;
  color?: string;
  tooltipText?: string;
  tooltipTitle?: string;
}

/**
 * Custom dropdown replacing the native `<select>` for the sign picker. A native select's open
 * popup is rendered by the OS/browser chrome, not the page — on mobile that popup's position and
 * option font-size are outside CSS's reach entirely, which is what made the native version
 * misposition itself and render options too small on some mobile browsers. This portals its own
 * listbox straight to `document.body`, positioned with `position: fixed` from the trigger's live
 * `getBoundingClientRect()` (same escape-any-clipping-ancestor technique as Tooltip.tsx), so both
 * position and font size are fully under our control regardless of device.
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  style,
  ariaLabel
}: {
  value: T;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ left: number; anchorY: number; width: number; maxHeight: number; openUp: boolean }>({
    left: -9999,
    anchorY: -9999,
    width: 0,
    maxHeight: MAX_LIST_HEIGHT,
    openUp: false
  });

  const current = options.find((o) => o.value === value) ?? options[0];

  const close = () => setOpen(false);

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    if (!triggerRef.current) return;
    setRect(triggerRef.current.getBoundingClientRect());
    setOpen(true);
  };

  const pick = (v: T) => {
    onChange(v);
    close();
    triggerRef.current?.focus();
  };

  // Opening the listbox moves focus straight to the currently-selected option (falling back to
  // the first one) rather than leaving focus on the trigger — this is what makes arrow-key
  // navigation usable immediately after opening, matching a native <select>'s own behavior of
  // starting keyboard navigation from whichever option is already chosen. Runs after the portal
  // has actually mounted (useLayoutEffect, so there's no visible frame where focus is stuck on the
  // trigger while the list is open).
  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const selected = list.querySelector<HTMLButtonElement>(`button[data-value="${value}"]`);
    (selected ?? list.querySelector<HTMLButtonElement>("button"))?.focus();
  }, [open, value]);

  // ArrowDown/ArrowUp on the trigger while closed opens the list, matching a native <select>'s own
  // behavior — the useLayoutEffect above then immediately focuses an option, so the very next
  // ArrowDown/ArrowUp (once the list is open) is already handled by onListKeyDown below.
  const onTriggerKeyDown = (e: ReactKeyboardEvent) => {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
      e.preventDefault();
      toggle();
    }
  };

  // Moves focus between the option <button>s directly (a roving-focus listbox, not a "highlighted
  // but unfocused" native-select-style list) — these are real, individually-focusable buttons
  // already, so this is the minimal way to make ArrowUp/ArrowDown do anything at all once the list
  // is open; without it, only Tab (not arrow keys) could move between options. Clamps at the
  // first/last option rather than wrapping around, matching the WAI-ARIA listbox pattern's default
  // (non-wrapping) recommendation. `preventDefault` stops the arrow key from also scrolling the
  // underlying page.
  const onListKeyDown = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = e.key === "ArrowDown" ? Math.min(currentIndex + 1, buttons.length - 1) : Math.max(currentIndex - 1, 0);
    buttons[nextIndex]?.focus();
  };

  // Mirrors Tooltip's own live-rect positioning: computed from the trigger's actual on-screen
  // position rather than CSS anchoring, so a clipping/scrolling ancestor can never cut the popup
  // off. Opens upward instead of downward when there isn't enough room below (e.g. the last
  // player slot near the bottom of the screen) and there's more room above.
  useLayoutEffect(() => {
    if (!open || !rect) return;
    const width = Math.max(rect.width, 220);
    const spaceBelow = window.innerHeight - rect.bottom - EDGE_MARGIN;
    const spaceAbove = rect.top - EDGE_MARGIN;
    const openUp = spaceBelow < MIN_LIST_HEIGHT && spaceAbove > spaceBelow;
    const maxHeight = Math.min(MAX_LIST_HEIGHT, Math.max(MIN_LIST_HEIGHT, openUp ? spaceAbove : spaceBelow));
    let left = rect.left;
    if (left + width > window.innerWidth - EDGE_MARGIN) left = window.innerWidth - EDGE_MARGIN - width;
    if (left < EDGE_MARGIN) left = EDGE_MARGIN;
    setPos({ left, anchorY: openUp ? rect.top - GAP : rect.bottom + GAP, width, maxHeight, openUp });
  }, [open, rect]);

  // A fixed-positioned portal doesn't track the trigger, so treat scroll/resize the same way
  // Tooltip does — just dismiss rather than continuously repositioning a momentary popup.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={className}
        style={style}
      >
        {current?.label}
      </button>
      {open &&
        createPortal(
          <ul
            ref={listRef}
            role="listbox"
            onKeyDown={onListKeyDown}
            className="fixed z-9 overflow-y-auto overflow-x-hidden rounded-lg border py-1"
            style={{
              left: pos.left,
              top: pos.openUp ? undefined : pos.anchorY,
              bottom: pos.openUp ? window.innerHeight - pos.anchorY : undefined,
              width: pos.width,
              maxHeight: pos.maxHeight,
              borderColor: "#3b2d5e",
              background: "#140f24",
              boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
              scrollbarWidth: 'none'
            }}
          >
            {options.map((o) => (
              <li key={o.value} role="option" aria-selected={o.value === value}>
                <Tooltip className="w-full" title={o.tooltipTitle} text={o.tooltipText} side="left">
                  <button
                    type="button"
                    data-value={o.value}
                    onClick={() => pick(o.value)}
                    className="w-full text-left px-3 py-2.5 text-base font-bold"
                    style={{ color: o.color ?? "#f1eeff", background: o.value === value ? "#3b2d5e" : "transparent" }}
                  >
                    {o.label}
                  </button>
                </Tooltip>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </>
  );
}
