"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Toaster } from "sonner";
import { CurrencyProvider } from "@/components/ui/money";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false, staleTime: 30_000 },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      {/* Once one tooltip is open, adjacent ones open instantly. */}
      <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={300}>
        <CurrencyProvider>{children}</CurrencyProvider>
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              background: "var(--surface-3)",
              border: "1px solid var(--hairline-strong)",
              color: "var(--text-1)",
              borderRadius: "8px",
              fontSize: "13px",
            },
          }}
        />
      </TooltipPrimitive.Provider>
    </QueryClientProvider>
  );
}
