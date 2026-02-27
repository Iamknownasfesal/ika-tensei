import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/wallet/Providers";
import { ToastProvider } from "@/components/ui/ToastSystem";
import { NavigationBar } from "@/components/ui/NavigationBar";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { DemoModeBanner } from "@/components/ui/DemoModeBanner";
import { EasterEggs } from "@/components/ui/EasterEggs";

export const metadata: Metadata = {
  title: "イカ転生 | Ika Tensei - NFT Reincarnation Protocol",
  description: "Seal your NFTs from any chain. Reborn on Solana. Join the Adventurer's Guild.",
  keywords: ["NFT", "cross-chain", "Solana", "Ethereum", "Base", "EVM", "reincarnation", "bridge"],
  authors: [{ name: "Ika Tensei Team", url: "https://github.com/Illuminfti/ika-tensei" }],
  openGraph: {
    title: "イカ転生 | Ika Tensei - NFT Reincarnation Protocol",
    description: "Seal your NFTs from any chain. Reborn on Solana. Join the Adventurer's Guild.",
    url: "https://frontend-phi-nine-12.vercel.app",
    siteName: "Ika Tensei",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "イカ転生 | Ika Tensei",
    description: "Seal your NFTs from any chain. Reborn on Solana. Join the Adventurer's Guild.",
    creator: "@IkaTensei",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scanlines">
      <head>
        <link rel="stylesheet" href="/nes.min.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Silkscreen:wght@400;700&family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-void-purple text-ghost-white min-h-screen">
        <EasterEggs>
          <Providers>
            <ToastProvider>
              <ErrorBoundary>
                <DemoModeBanner />
                <NavigationBar />
                <main className="pt-16">
                  {children}
                </main>
              </ErrorBoundary>
            </ToastProvider>
          </Providers>
        </EasterEggs>
      </body>
    </html>
  );
}
