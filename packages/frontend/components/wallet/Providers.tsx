"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, ReactNode, lazy, Suspense } from "react";
import { DYNAMIC_ENV_ID } from "@/lib/constants";

// Lazy-load Dynamic only when env ID is configured
// This prevents WalletConnect from requesting local network access in dev/demo mode
const DynamicProvider = lazy(() =>
  import("./DynamicProvider").then((mod) => ({ default: mod.DynamicProvider }))
);

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  }));

  // If no Dynamic env ID, render without wallet provider (dev/demo mode)
  if (!DYNAMIC_ENV_ID) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={children}>
        <DynamicProvider envId={DYNAMIC_ENV_ID}>
          {children}
        </DynamicProvider>
      </Suspense>
    </QueryClientProvider>
  );
}
