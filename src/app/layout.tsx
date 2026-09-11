import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "HitBox Collectibles Admin",
    template: "%s · HitBox Collectibles",
  },
  description:
    "Operations console for HitBox Collectibles — orders, finance, drops, provenance and access control.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      appearance={{
        theme: dark,
        variables: {
          colorPrimary: "#5E6AD2",
          colorBackground: "#16171C",
          colorForeground: "#F7F8F8",
          colorMutedForeground: "#9CA3AF",
          colorInput: "#1E1F25",
          colorInputForeground: "#F7F8F8",
          borderRadius: "8px",
          fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
        },
        elements: {
          card: "border border-[rgba(255,255,255,0.06)] shadow-none",
        },
      }}
    >
      <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
        <body>
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
