"use client";

import * as React from "react";
import { usePermissions } from "./authz-provider";

/**
 * Renders its children only when the caller may open `href` — the same rule
 * the sidebar and the page guard use (ROUTE_ACCESS in lib/authz.ts). A link
 * to a screen that answers 403 teaches people their tools are broken.
 */
export function IfCanOpen({ href, children }: { href: string; children: React.ReactNode }) {
  return usePermissions().canOpen(href) ? <>{children}</> : null;
}
