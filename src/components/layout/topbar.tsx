"use client";

import * as React from "react";
import { UserButton } from "@clerk/nextjs";
import { Menu, ShieldCheck } from "lucide-react";
import { humanizeRoleName } from "@/lib/authz";
import { Badge, Button, Tooltip } from "@/components/ui/primitives";
import { useAuthz } from "./authz-provider";

/**
 * There is deliberately no "View as <role>" control here.
 *
 * The backend has no impersonation endpoint, no `?viewAs=` parameter and no
 * role-preview mode — `/authz/me` returns the caller's own effective
 * permissions and nothing else, and authorization is resolved from the
 * caller's own grants on every request (admin-console-api.md §17). A switcher
 * would either lie about the data or require a feature that does not exist.
 */
export function Topbar({
  title,
  description,
  actionsSlotRef,
  onOpenSidebar,
}: {
  title: string;
  description?: string;
  actionsSlotRef: (el: HTMLElement | null) => void;
  onOpenSidebar?: () => void;
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
