import * as React from "react";

import { cn } from "./utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-ink placeholder:text-muted-soft selection:bg-primary selection:text-on-primary flex h-9 w-full min-w-0 rounded-md border border-border-strong bg-canvas px-3 py-1 text-base text-ink transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:ring-[3px]",
        "aria-invalid:ring-error/30 aria-invalid:border-error",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
