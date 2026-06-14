"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-7 w-full rounded-none border border-hairline bg-canvas px-2 font-mono text-[12px] text-text placeholder:text-faint outline-none transition-colors focus-visible:border-line-strong focus-visible:ring-0",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
