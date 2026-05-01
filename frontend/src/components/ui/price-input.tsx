import * as React from "react";

import { Input } from "./input";

type PriceInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "type" | "inputMode" | "pattern"
> & {
  value: string;
  onChange: (next: string) => void;
};

// Whole-dollar price input. Strips non-digits before they reach state, so
// letters / decimals / "$" / pasted junk never appear in the field. Backend
// stores priceCents (int), so decimals are intentionally disallowed.
function PriceInput({ value, onChange, ...rest }: PriceInputProps) {
  return (
    <Input
      {...rest}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
    />
  );
}

export { PriceInput };
