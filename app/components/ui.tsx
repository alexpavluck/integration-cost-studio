"use client";

import { toNonNegativeNumber, toNumber } from "../../lib/format.ts";

export function NumberInput({
  value,
  onChange,
  ariaLabel,
  prefix,
  suffix,
  step = 1,
  allowNegative = false,
}: {
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  prefix?: string;
  suffix?: string;
  step?: number;
  allowNegative?: boolean;
}) {
  return (
    <span className="num-field">
      {prefix ? <i className="num-affix">{prefix}</i> : null}
      <input
        aria-label={ariaLabel}
        type="number"
        step={step}
        min={allowNegative ? undefined : 0}
        value={value}
        onChange={(event) =>
          onChange(
            allowNegative
              ? toNumber(event.target.value, value)
              : toNonNegativeNumber(event.target.value, value),
          )
        }
      />
      {suffix ? <i className="num-affix">{suffix}</i> : null}
    </span>
  );
}

export function TextInput({
  value,
  onChange,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <input
      aria-label={ariaLabel}
      className={className}
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
