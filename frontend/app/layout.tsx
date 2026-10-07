import type { Metadata } from "next";
import "./globals.css";

import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { MotionProvider } from "@/components/motion-provider";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import { Toaster } from "@/components/ui/sonner";

// Machine-voice mono font — bound to --font-geist-mono, which globals.css
// maps to --font-mono (font-mono utility). Self-hosted at build time.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// UI typeface (SIL Open Font License), self-hosted at build time like the
// mono font. Bound to --font-ui, which globals.css maps to --font-sans.
const sans = Geist({
  variable: "--font-ui",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Simple T99",
  description:
    "Simple T99 (SimpleAdmin) — web interface for the Foxconn T99W175 modem.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${sans.variable} ${geistMono.variable} ${sans.className} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <MotionProvider>
            {/* Client-only i18next provider — wraps BOTH the pre-auth (login /
                setup) shell and the authenticated app so every surface can call
                t(). Nested under MotionProvider because the root layout is a
                server component and the provider is "use client". */}
            <I18nProvider>
              {children}
              <Toaster />
            </I18nProvider>
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
