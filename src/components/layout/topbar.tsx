"use client";

import * as React from "react";
import { UserButton } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, FlaskConical, Menu, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { humanizeRoleName } from "@/lib/authz";
import { PREVIEW_ROLE_KEY } from "@/lib/api/client";
import { useStoredValue } from "@/lib/stored-value";
import { Badge, Button, Tooltip } from "@/components/ui/primitives";
import { useAuthz } from "./authz-provider";

const DEMO_ROLES = [
  "HITBOX_SYSTEM_ADMIN",
  "HITBOX_DROP_MANAGER",
  "HITBOX_CONTENT_MANAGER",
  "HITBOX_ORDER_MANAGER",
  "HITBOX_FINANCE_ADMIN",
  "HITBOX_SUPPORT",
  "HITBOX_COMPLIANCE_OFFICER",
  "BRAND_ADMIN",
  "BRAND_EMPLOYEE",
  "ARTIST",
  "HITBOX_PLATFORM_ENGINEER",
  "HITBOX_FULL_STACK_ENGINEER",
];

export function Topbar({
  title,
  description,
  actionsSlotRef,
  onOpenSidebar,
  demoMode,
}: {
  title: string;
  description?: string;
  actionsSlotRef: (el: HTMLElement | null) => void;
  onOpenSidebar?: () => void;
  demoMode: boolean;
}) {
  const { me, perms } = useAuthz();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--hairline)] bg-[rgba(8,9,10,0.82)] backdrop-blur-xl">
      <div className="flex h-[60px] items-center gap-3.5 px-4 sm:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          aria-label="Open navigation"
          onClick={onOpenSidebar}
        >
          <Menu className="h-4 w-4" />
        </Button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
            {title}
          </h1>
          {description ? (
            <p className="truncate text-[12.5px] text-[var(--text-3)]">{description}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2.5">
          {/* Pages portal their own buttons in here via <PageActions>. */}
          <div ref={actionsSlotRef} className="flex items-center gap-2" />

          {demoMode ? <DemoRoleSwitcher /> : null}

          {me?.roles?.length ? (
            <Tooltip
              content={
                <div className="space-y-1">
                  <p className="font-medium text-[var(--text-1)]">
                    {me.roles.length === 1 ? "Your role" : "Your roles"}
                  </p>
                  {me.roles.map((r) => (
                    <p key={r.roleId} className="text-[11px] text-[var(--text-2)]">
                      {humanizeRoleName(r.roleName)}
                      {r.organizationId ? " · org-scoped" : " · platform-wide"}
                    </p>
                  ))}
                  <p className="pt-1 text-[11px] text-[var(--text-3)]">
                    {perms.keys.length} effective permissions
                  </p>
                </div>
              }
            >
              <span className="hidden sm:block">
                <Badge tone="neutral" className="cursor-help gap-1.5 py-1">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  {humanizeRoleName(me.roles[0].roleName)}
                  {me.roles.length > 1 ? ` +${me.roles.length - 1}` : ""}
                </Badge>
              </span>
            </Tooltip>
          ) : null}

          <div className="ml-0.5 flex items-center">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-7 w-7",
                  userButtonPopoverCard:
                    "bg-[var(--surface-2)] border border-[var(--hairline-strong)]",
                },
              }}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Demo-mode only. Lets an operator preview the console exactly as another
 * role sees it, which is the fastest way to verify that a section is being
 * omitted rather than zeroed.
 */
function DemoRoleSwitcher() {
  const qc = useQueryClient();
  const [stored, setStored] = useStoredValue(PREVIEW_ROLE_KEY);
  const role = stored ?? DEMO_ROLES[0];

  const choose = (next: string) => {
    setStored(next);
    qc.invalidateQueries();
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="pressable inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-1)] px-2.5 text-[12.5px] text-[var(--text-2)] transition-colors hover:border-[var(--hairline-strong)] hover:text-[var(--text-1)]">
          <FlaskConical className="h-3.5 w-3.5 text-[var(--warning)]" aria-hidden />
          <span className="hidden md:inline">View as</span>
          <span className="max-w-[120px] truncate font-medium text-[var(--text-1)]">
            {humanizeRoleName(role)}
          </span>
          <ChevronDown className="h-3 w-3" aria-hidden />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="rx-content rx-anchored z-[60] w-[260px] rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--surface-2)] p-1 shadow-[var(--shadow-3)]"
        >
          <p className="px-2 py-1.5 text-[11px] leading-relaxed text-[var(--text-3)]">
            Demo data only. Switching re-requests every endpoint as that role,
            so you can see which sections disappear.
          </p>
          <div className="my-1 h-px bg-[var(--hairline)]" />
          {DEMO_ROLES.map((r) => (
            <DropdownMenu.Item
              key={r}
              onSelect={() => choose(r)}
              className={cn(
                "flex cursor-pointer items-center justify-between rounded-[5px] px-2 py-1.5 text-[12px] outline-none transition-colors",
                r === role
                  ? "bg-[var(--accent-dim)] text-[var(--accent-text)]"
                  : "text-[var(--text-2)] data-[highlighted]:bg-[var(--surface-3)] data-[highlighted]:text-[var(--text-1)]"
              )}
            >
              {humanizeRoleName(r)}
              {r.startsWith("HITBOX_PLATFORM") || r.startsWith("HITBOX_FULL") ? (
                <span className="text-[10px] text-[var(--text-3)]">technical</span>
              ) : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
