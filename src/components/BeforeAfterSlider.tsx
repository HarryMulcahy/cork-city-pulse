import { useState } from "react";

interface Props {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
}

/**
 * Keyboard-accessible before/after image comparison. The range input drives a clip-path
 * reveal of the "before" image over the "after" image, so it works with mouse and keyboard.
 */
export function BeforeAfterSlider({ beforeSrc, afterSrc, beforeLabel = "Before", afterLabel = "After" }: Props) {
  const [pos, setPos] = useState(50);
  return (
    <div className="relative w-full aspect-video rounded-md overflow-hidden border border-border bg-secondary select-none">
      <img src={afterSrc} alt={afterLabel} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      <img
        src={beforeSrc}
        alt={beforeLabel}
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />
      <div
        className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
        style={{ left: `${pos}%` }}
        aria-hidden="true"
      />
      <span className="absolute top-2 left-2 text-[10px] font-mono bg-foreground/70 text-background px-1.5 py-0.5 rounded pointer-events-none">
        {beforeLabel}
      </span>
      <span className="absolute top-2 right-2 text-[10px] font-mono bg-foreground/70 text-background px-1.5 py-0.5 rounded pointer-events-none">
        {afterLabel}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label={`Compare ${beforeLabel} and ${afterLabel} — drag to reveal`}
        className="absolute inset-x-0 bottom-2 mx-auto w-[92%] cursor-ew-resize accent-[#ffcc00]"
      />
    </div>
  );
}
