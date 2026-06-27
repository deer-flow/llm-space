import { type Metadata } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "LLM Space",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={cn("overscroll-none", geist.variable, "font-sans")}
      suppressHydrationWarning
    >
      <head>
        <Script
          src="//unpkg.com/react-scan/dist/auto.global.js"
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />
      </head>
      <body className="bg-[#202124]">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          forcedTheme="dark"
          disableTransitionOnChange
        >
          <Toaster theme="dark" position="top-center" />
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
