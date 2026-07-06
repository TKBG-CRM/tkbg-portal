"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { parseAmount, formatAmount } from "@/lib/numbers";

type MoneyInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "type" | "inputMode"
> & {
  value: string;
  onChange: (value: string) => void;
};

// Money-shaped input that swaps between a raw editable view and a
// formatted "$1,234" view based on focus, so users see the dollar sign
// and thousands separators as soon as they finish typing without
// fighting with cursor positions while editing.
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, onFocus, onBlur, className, ...props }, ref) => {
    const [focused, setFocused] = React.useState(false);

    const display = focused
      ? value
      : value && parseAmount(value) != null
        ? formatAmount(value)
        : value;

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={display}
        className={className}
        onFocus={(e) => {
          setFocused(true);
          // Re-show the raw, unformatted number so the user can edit it
          // without dollar signs in the way.
          const raw = parseAmount(value);
          if (raw != null) onChange(String(raw));
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      />
    );
  }
);
MoneyInput.displayName = "MoneyInput";
