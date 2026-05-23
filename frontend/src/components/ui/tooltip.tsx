import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

// Shared tooltip primitive. All hover-helpers in the app go through this so
// width, wrapping, and Brutalist Trade styling stay consistent.
//
// Width is fixed at 220px and text wraps — keeps short and long labels
// visually aligned in the same surface shape. Caller writes concise content;
// long-form copy belongs in a modal or inline help text, not a tooltip.

const TOOLTIP_CLASS = [
  "max-w-[220px]",
  "bg-ink text-on-dark",
  "rounded-md shadow-overlay",
  "px-2.5 py-1.5",
  "text-[11px] leading-snug",
  "z-50",
  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95",
].join(" ");

export const TooltipProvider = TooltipPrimitive.Provider;

type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  delayDuration?: number;
};

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  delayDuration = 300,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          className={TOOLTIP_CLASS}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-ink" width={10} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
