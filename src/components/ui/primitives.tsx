"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

const buttonVariants = cva(
  "pressable inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[6px] font-medium select-none disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-[var(--shadow-1)]",
        secondary:
          "bg-[var(--surface-2)] text-[var(--text-1)] border border-[var(--hairline)] hover:bg-[var(--surface-3)] hover:border-[var(--hairline-strong)]",
        ghost:
          "text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)]",
        danger:
          "bg-[var(--danger-dim)] text-[var(--danger)] border border-[rgba(204,92,92,0.25)] hover:bg-[rgba(204,92,92,0.2)]",
        outline:
          "border border-[var(--hairline-strong)] text-[var(--text-1)] hover:bg-[var(--surface-2)]",
      },
      size: {
        sm: "h-7 px-2.5 text-[12px]",
        md: "h-8 px-3 text-[13px]",
        lg: "h-10 px-4 text-[14px]",
        icon: "h-8 w-8",
        "icon-sm": "h-7 w-7",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

/* ------------------------------------------------------------------ */
/* Panel — the hairline-bordered surface everything sits on            */
/* ------------------------------------------------------------------ */

export function Panel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-1)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-[var(--hairline)] px-4 py-3",
        className
      )}
    >
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
          {title}
        </h3>
        {description ? (
          <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-3)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium leading-[18px] whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-[rgba(255,255,255,0.06)] text-[var(--text-2)]",
        accent: "bg-[var(--accent-dim)] text-[var(--accent-text)]",
        positive: "bg-[var(--positive-dim)] text-[var(--positive)]",
        warning: "bg-[var(--warning-dim)] text-[var(--warning)]",
        danger: "bg-[var(--danger-dim)] text-[var(--danger)]",
        info: "bg-[var(--info-dim)] text-[var(--info)]",
      },
      outline: {
        true: "bg-transparent border border-[var(--hairline-strong)]",
        false: "",
      },
    },
    defaultVariants: { tone: "neutral", outline: false },
  }
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({
  className,
  tone,
  outline,
  dot,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ tone, outline }), className)} {...props}>
      {dot ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
          aria-hidden
        />
      ) : null}
      {children}
    </span>
  );
}

/** Maps the API's status vocabularies onto the semantic palette. */
export function toneForStatus(status: string): BadgeTone {
  const s = status.toUpperCase();
  if (
    ["DELIVERED", "PAID", "SUCCESS", "CLEAN", "ACTIVE", "APPROVED", "RESOLVED", "CLAIMED", "CLEARED", "RECEIVED", "SUCCEEDED", "PROCESSED", "PUBLISHED"].includes(s)
  )
    return "positive";
  if (
    ["PENDING", "PENDING_PAYMENT", "IN_REVIEW", "SUBMITTED", "INVESTIGATING", "AWAITING_RETURN", "PARTIAL", "IN_TRANSIT", "INITIATED", "PROCESSING", "REQUESTED"].includes(s)
  )
    return "warning";
  if (["FAILED", "REJECTED", "CANCELLED", "INFECTED", "BLOCKED", "DISPUTED", "FLAGGED", "CRITICAL", "TAMPERED", "DELAYED"].includes(s))
    return "danger";
  if (["SHIPPED", "REFUNDED", "BOUND", "OPEN", "DRAFT", "WARNING"].includes(s)) return "info";
  if (["ARCHIVED", "ENDED", "WITHDRAWN", "SKIPPED", "UNCLAIMED", "INACTIVE"].includes(s))
    return "neutral";
  return "neutral";
}

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
  delay = 400,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  delay?: number;
}) {
  if (!content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root delayDuration={delay}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="rx-content rx-anchored z-[70] max-w-[280px] rounded-[6px] border border-[var(--hairline-strong)] bg-[var(--surface-3)] px-2 py-1.5 text-[12px] leading-snug text-[var(--text-1)] shadow-[var(--shadow-2)]"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={cn("skeleton", className)} style={style} aria-hidden />;
}

/* ------------------------------------------------------------------ */
/* Input & field chrome                                                */
/* ------------------------------------------------------------------ */

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-8 w-full rounded-[6px] border bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--text-1)] placeholder:text-[var(--text-3)] transition-colors duration-150",
      invalid
        ? "border-[rgba(204,92,92,0.5)]"
        : "border-[var(--hairline)] hover:border-[var(--hairline-strong)] focus:border-[var(--accent)]",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2.5 py-2 text-[13px] text-[var(--text-1)] placeholder:text-[var(--text-3)] transition-colors duration-150 hover:border-[var(--hairline-strong)] focus:border-[var(--accent)]",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  /**
   * Marks the label with an asterisk. Pass the result of `isRequired()`
   * (src/lib/required-fields.ts) rather than a hand-typed boolean, so the
   * mark tracks the zod schema that actually validates the form instead of
   * becoming a second, driftable copy of "which fields matter".
   */
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-[12px] font-medium text-[var(--text-2)]"
      >
        {label}
        {required ? (
          <span className="ml-0.5 text-[var(--danger)]" aria-hidden>
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-[11px] text-[var(--danger)]">{error}</p>
      ) : hint ? (
        <p className="text-[11px] leading-relaxed text-[var(--text-3)]">{hint}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control                                                   */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className="inline-flex items-center gap-0.5 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-1)] p-0.5"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "pressable rounded-[4px] font-medium transition-colors",
              size === "sm" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-[12px]",
              active
                ? "bg-[var(--surface-3)] text-[var(--text-1)]"
                : "text-[var(--text-3)] hover:text-[var(--text-2)]"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mono chip — ids, permission keys, storage refs                      */
/* ------------------------------------------------------------------ */

export function Mono({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <code
      title={title}
      className={cn(
        "rounded-[4px] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--accent-text)]",
        className
      )}
    >
      {children}
    </code>
  );
}
