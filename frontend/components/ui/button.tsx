"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Small, square, hairline-bordered. Accent reserved for the one primary action.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-none text-[12px] font-medium outline-none transition-colors focus-visible:ring-1 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        ghost: "text-muted hover:bg-surface2 hover:text-text",
        secondary:
          "border border-hairline bg-surface text-text hover:bg-surface2 hover:border-line-strong",
        accent:
          "border border-accent bg-accent-wash text-accent hover:bg-accent/20",
      },
      size: {
        sm: "h-7 px-2.5",
        icon: "size-7",
        "icon-sm": "size-6",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "sm",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
