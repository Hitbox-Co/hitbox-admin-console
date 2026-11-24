import { AuthzProvider } from "@/components/layout/authz-provider";
import { AuthzGate } from "@/components/layout/authz-gate";
import { AppShell } from "@/components/layout/app-shell";
import { BootstrapPrefetch } from "@/components/layout/bootstrap-prefetch";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthzProvider>
      {/* Outside the gate on purpose: it has to run while /authz/me is still
          in flight, or the landing page's own request queues behind it. */}
      <BootstrapPrefetch />
      {/* Nothing can render until /authz/me answers — the navigation itself
          is derived from it. */}
      <AuthzGate>
        <AppShell>{children}</AppShell>
      </AuthzGate>
    </AuthzProvider>
  );
}
