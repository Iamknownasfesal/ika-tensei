"use client";

import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { SolanaWalletConnectors } from "@dynamic-labs/solana";
import { ReactNode } from "react";

export function DynamicProvider({ envId, children }: { envId: string; children: ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: envId,
        walletConnectors: [SolanaWalletConnectors],
        cssOverrides: `
          .dynamic-widget-inline-controls { background: #231832 !important; }
          .dynamic-widget-inline-controls * { font-family: "Silkscreen", monospace !important; }
        `,
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}
