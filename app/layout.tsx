import type { Metadata, Viewport } from "next";
import { Archivo, Instrument_Serif, Inter, Space_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { NO_FLASH_SCRIPT } from "@/components/providers/theme-provider";
import { runtimeConfig } from "@/lib/config/runtime";
import { SpeedInsights } from "@vercel/speed-insights/next";

// --- BVRB3R type system ---------------------------------------------------
// Archivo   → display / section headings
// Instrument Serif → editorial headlines (the gold-period signature)
// Inter     → body / UI text
// Space Mono → kickers, eyebrow labels, mono tags
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-archivo",
  display: "swap"
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap"
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap"
});

const fontVariables = `${archivo.variable} ${instrumentSerif.variable} ${inter.variable} ${spaceMono.variable}`;

const iosDeepLink = `${runtimeConfig.appLinkScheme}://open?href=%2Fdiscover`;
const androidDeepLink = `${runtimeConfig.appLinkScheme}://open?href=%2Fdiscover`;

export const metadata: Metadata = {
  title: "BVRB3R Platform",
  description: "Premium barbershop operating system for The BVRB3R Shop(TM) & Co.",
  manifest: "/manifest.webmanifest",
  applicationName: "BVRB3R Platform",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BVRB3R Platform"
  },
  formatDetection: {
    telephone: false
  },
  metadataBase: new URL(runtimeConfig.appUrl)
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#0A0A0C",
  colorScheme: "dark",
  interactiveWidget: "resizes-content"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={fontVariables}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="BVRB3R Platform" />
        <meta name="apple-itunes-app" content={runtimeConfig.nativeAppStoreId ? `app-id=${runtimeConfig.nativeAppStoreId}` : "app-clip-bundle-id=com.bvrb3r.platform"} />
        <meta property="al:ios:url" content={iosDeepLink} />
        <meta property="al:ios:app_name" content="BVRB3R Platform" />
        {runtimeConfig.nativeAppStoreId ? <meta property="al:ios:app_store_id" content={runtimeConfig.nativeAppStoreId} /> : null}
        <meta property="al:android:url" content={androidDeepLink} />
        <meta property="al:android:app_name" content="BVRB3R Platform" />
        <meta property="al:android:package" content={runtimeConfig.nativeAndroidPackageName} />
        <meta property="al:web:url" content={`${runtimeConfig.appUrl}/discover`} />
      </head>
      <body className="app-screen bg-black text-white antialiased">
        <AppProviders>{children}</AppProviders>
        <SpeedInsights />
      </body>
    </html>
  );
}
