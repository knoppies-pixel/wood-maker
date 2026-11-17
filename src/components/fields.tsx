import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

export function CommitNumber({
  value,
  onCommit,
  min,
  max,
  suffix = "mm",
  className,
  label,
}: {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  className?: string;
  label?: string;
}) {
  const [text, setText] = useState(() => show(value));
  useEffect(() => setText(show(value)), [value]);

  function commit() {
    const next = Number(text);
    if (!Number.isFinite(next)) {
      setText(show(value));
      return;
    }
    const clamped = Math.min(max ?? next, Math.max(min ?? next, next));
    onCommit(clamped);
    setText(show(clamped));
  }

  return (
    <label className="flex min-w-0 flex-col gap-1">
      {label ? <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</span> : null}
      <span className="relative">
        <Input
          value={text}
          inputMode="decimal"
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className={cn("nums pr-9", className)}
        />
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] text-muted-foreground">{suffix}</span>
      </span>
    </label>
  );
}

function show(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
