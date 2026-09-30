"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronsUpDown, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A searchable picker over records that carry an id and a name.
 *
 * The value is always the id — that is what the API takes — but the operator
 * only ever reads and types names. A raw uuid box asks a person to copy an
 * identifier out of another screen, and a typo there is a valid-looking uuid
 * pointing at nothing, or at the wrong payee.
 *
 * `allowUuid` covers the one case a list cannot: list endpoints cap at 100
 * rows, so an older order or ledger line may not be among the options. A
 * pasted uuid is then offered as its own choice, labelled as such.
 */

export interface ComboOption {
  value: string;
  label: string;
  /** Second line — type, code, amount, date. Searched too. */
  hint?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "Nothing matches.",
  loading,
  disabled,
  invalid,
  clearable = true,
  allowUuid,
  size = "md",
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loading?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  clearable?: boolean;
  allowUuid?: boolean;
  /** `md` sits in a form; `sm` sits in a filter row. */
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listId = React.useId();

  const selected = options.find((o) => o.value === value);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint ?? "").toLowerCase().includes(q) ||
        o.value.toLowerCase() === q
    );
  }, [options, query]);

  const pasted = query.trim();
  const offerUuid =
    allowUuid && UUID.test(pasted) && !options.some((o) => o.value === pasted);
  const rows: ComboOption[] = offerUuid
    ? [{ value: pasted, label: "Use this id", hint: pasted }, ...filtered]
    : filtered;

  const pick = (v: string | undefined) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (row) pick(row.value);
    }
  };

  React.useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // A value that is not in the list — a pasted id, or a row past the first
  // page — still shows something readable rather than a blank trigger.
  const triggerText = selected
    ? selected.label
    : value
      ? `${value.slice(0, 8)}…`
      : placeholder;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setActive(0);
        else setQuery("");
      }}
    >
      <div className={cn("relative", className)}>
        <Popover.Trigger asChild disabled={disabled}>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-haspopup="listbox"
            aria-label={ariaLabel}
            aria-invalid={invalid || undefined}
            className={cn(
              "flex w-full items-center gap-2 rounded-[6px] border bg-[var(--surface-2)] text-left text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)] disabled:cursor-not-allowed disabled:opacity-50",
              size === "sm" ? "h-7 px-2 text-[12px]" : "h-8 px-2.5 text-[13px]",
              invalid ? "border-[var(--danger)]" : "border-[var(--hairline)]",
              clearable && value ? "pr-7" : ""
            )}
          >
            <span className={cn("min-w-0 flex-1 truncate", !selected && !value && "text-[var(--text-3)]")}>
              {triggerText}
            </span>
            {selected?.hint && size === "md" ? (
              <span className="hidden max-w-[45%] truncate text-[11px] text-[var(--text-3)] sm:inline">
                {selected.hint}
              </span>
            ) : null}
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-3)]" aria-hidden />
            ) : clearable && value ? null : (
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" aria-hidden />
            )}
          </button>
        </Popover.Trigger>
        {clearable && value && !disabled ? (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => onChange(undefined)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[4px] p-0.5 text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-[60] w-[var(--radix-popover-trigger-width)] min-w-[260px] overflow-hidden rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--surface-2)] shadow-[var(--shadow-3)]"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector("input")?.focus();
          }}
        >
          <div className="relative border-b border-[var(--hairline)]">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-3)]"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={allowUuid ? `${searchPlaceholder} or paste an id` : searchPlaceholder}
              className="h-9 w-full bg-transparent pl-8 pr-3 text-[12.5px] text-[var(--text-1)] outline-none placeholder:text-[var(--text-3)]"
            />
          </div>

          <ul id={listId} ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {loading && options.length === 0 ? (
              <li className="px-3 py-2 text-[12px] text-[var(--text-3)]">Loading…</li>
            ) : rows.length === 0 ? (
              <li className="px-3 py-2 text-[12px] text-[var(--text-3)]">{emptyText}</li>
            ) : (
              rows.map((o, i) => (
                <li
                  key={`${o.value}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={o.value === value}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o.value)}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 px-3 py-1.5",
                    i === active ? "bg-[var(--surface-3)]" : ""
                  )}
                >
                  <Check
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]",
                      o.value === value ? "opacity-100" : "opacity-0"
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] text-[var(--text-1)]">{o.label}</span>
                    {o.hint ? (
                      <span className="block truncate text-[11px] text-[var(--text-3)]">{o.hint}</span>
                    ) : null}
                  </span>
                </li>
              ))
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
