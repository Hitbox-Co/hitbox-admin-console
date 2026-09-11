"use client";

import * as React from "react";
import { ChevronRight, Lock, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { humanize } from "@/lib/format";
import { Badge, Mono, Tooltip } from "@/components/ui/primitives";
import { SearchInput } from "@/components/ui/filters";
import { EmptyState } from "@/components/ui/states";
import type { PermissionDomain, PermissionGroup } from "@/lib/types";

/**
 * The permission picker.
 *
 * Rendered entirely from the catalog the API returns — an admin can never
 * type a permission key, because the backend rejects anything not in the
 * catalog. Raw keys are shown as secondary detail, never as the primary UI.
 *
 * The tree is filtered to the role's own domain, which makes the
 * AUTHZ_DOMAIN_VIOLATION error unreachable from this screen.
 */
export function PermissionTree({
  groups,
  selected,
  onChange,
  domain,
  readOnly,
}: {
  groups: PermissionGroup[];
  selected: string[];
  onChange: (next: string[]) => void;
  domain: PermissionDomain;
  readOnly?: boolean;
}) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState<Record<string, boolean>>({});

  const inDomain = React.useMemo(
    () => groups.filter((g) => g.domain === domain),
    [groups, domain]
  );

  const filtered = React.useMemo(() => {
    if (!q.trim()) return inDomain;
    const needle = q.toLowerCase();
    return inDomain
      .map((g) => ({
        ...g,
        permissions: g.permissions.filter(
          (p) =>
            p.key.toLowerCase().includes(needle) ||
            p.description.toLowerCase().includes(needle) ||
            p.actionLabel.toLowerCase().includes(needle) ||
            g.group.toLowerCase().includes(needle)
        ),
      }))
      .filter((g) => g.permissions.length > 0);
  }, [inDomain, q]);

  const selectedSet = React.useMemo(() => new Set(selected), [selected]);

  const toggle = (key: string) => {
    if (readOnly) return;
    onChange(
      selectedSet.has(key) ? selected.filter((k) => k !== key) : [...selected, key]
    );
  };

  const toggleGroup = (group: PermissionGroup) => {
    if (readOnly) return;
    const keys = group.permissions.map((p) => p.key);
    const allOn = keys.every((k) => selectedSet.has(k));
    onChange(
      allOn
        ? selected.filter((k) => !keys.includes(k))
        : [...new Set([...selected, ...keys])]
    );
  };

  // Auto-expand a group that already has selections, or when searching.
  const isOpen = (g: PermissionGroup) =>
    open[g.resource] ??
    (!!q.trim() || g.permissions.some((p) => selectedSet.has(p.key)));

  if (inDomain.length === 0) {
    return (
      <EmptyState
        icon={Lock}
        title={`No ${domain.toLowerCase()}-domain permissions in the catalog`}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Filter permissions"
          className="w-[220px]"
        />
        <Badge tone="neutral">
          {selected.length} selected
        </Badge>
        <Tooltip content="Only same-domain permissions can sit on a role. The tree is filtered so a domain violation is not reachable from here.">
          <span>
            <Badge tone={domain === "TECHNICAL" ? "info" : "accent"}>
              {humanize(domain)} domain
            </Badge>
          </span>
        </Tooltip>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No permissions match that filter"
          description="Try a resource name like “order” or an action like “refund”."
        />
      ) : (
        <div className="divide-y divide-[var(--hairline)] overflow-hidden rounded-[8px] border border-[var(--hairline)]">
          {filtered.map((g) => {
            const keys = g.permissions.map((p) => p.key);
            const on = keys.filter((k) => selectedSet.has(k)).length;
            const expanded = isOpen(g);

            return (
              <div key={g.resource}>
                <div className="flex items-center gap-2 bg-[var(--surface-2)] px-3 py-2">
                  <button
                    type="button"
                    onClick={() =>
                      setOpen((o) => ({ ...o, [g.resource]: !expanded }))
                    }
                    aria-expanded={expanded}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 text-[var(--text-3)] transition-transform duration-150",
                        expanded && "rotate-90"
                      )}
                      aria-hidden
                    />
                    <span className="truncate text-[12px] font-medium text-[var(--text-1)]">
                      {g.group}
                    </span>
                    <Mono className="shrink-0 text-[10px]">{g.resource}</Mono>
                    {on > 0 ? (
                      <Badge tone="accent" className="shrink-0 px-1 py-0 text-[10px]">
                        {on}
                      </Badge>
                    ) : null}
                  </button>

                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={() => toggleGroup(g)}
                      className="pressable shrink-0 rounded-[4px] px-1.5 py-0.5 text-[11px] text-[var(--text-3)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]"
                    >
                      {on === keys.length ? "Clear all" : "Select all"}
                    </button>
                  ) : null}
                </div>

                {expanded ? (
                  <ul className="divide-y divide-[var(--hairline)]">
                    {g.permissions.map((p) => {
                      const checked = selectedSet.has(p.key);
                      return (
                        <li key={p.key}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-start gap-2.5 px-3 py-2 transition-colors",
                              readOnly
                                ? "cursor-default"
                                : "hover:bg-[var(--surface-2)]"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={readOnly}
                              onChange={() => toggle(p.key)}
                              className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[12px] font-medium text-[var(--text-1)]">
                                  {p.actionLabel}
                                </span>
                                <Badge tone="neutral" className="px-1 py-0 text-[10px]">
                                  {p.scopeLabel}
                                </Badge>
                              </span>
                              <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--text-3)]">
                                {p.description}
                              </span>
                              {/* The raw key, as secondary detail only. */}
                              <Mono className="mt-1 inline-block text-[10px]">
                                {p.key}
                              </Mono>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
