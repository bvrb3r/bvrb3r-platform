import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { runtimeConfig } from "@/lib/config/runtime";

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
  themeColor: "#050505",
  colorScheme: "dark",
  interactiveWidget: "resizes-content"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
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
      </body>
    </html>
  );
}
