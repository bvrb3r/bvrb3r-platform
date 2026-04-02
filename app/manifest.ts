import type { MetadataRoute } from "next";
import { runtimeConfig } from "@/lib/config/runtime";

export default function manifest() {
  return {
    id: "/",
    name: "BVRB3R Platform",
    short_name: "BVRB3R",
    description: "Premium mobile-first operating system for The BVRB3R Shop(TM) & Co.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui", "browser"],
    orientation: "portrait",
    background_color: "#050505",
    theme_color: "#050505",
    categories: ["business", "lifestyle", "productivity"],
    lang: "en-US",
    icons: [
      {
        src: "/icons/pwa-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/pwa-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/pwa-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: "/icons/apple-touch-180.png",
        sizes: "180x180",
        type: "image/png"
      }
    ],
    shortcuts: [
      {
        name: "Book Now",
        short_name: "Book",
        description: "Start a booking fast from the installed app.",
        url: "/booking/new"
      },
      {
        name: "Discover Barbers",
        short_name: "Discover",
        description: "Browse trusted barbers, rankings, and styles.",
        url: "/discover"
      },
      {
        name: "My Dashboard",
        short_name: "Dashboard",
        description: "Open your role workspace.",
        url: "/login"
      },
      {
        name: "Referrals",
        short_name: "Referrals",
        description: "Open referral sharing and rewards.",
        url: "/referrals"
      }
    ],
    protocol_handlers: [
      {
        protocol: "web+bvrb3r",
        url: "/discover?appLink=%s"
      }
    ],
    prefer_related_applications: Boolean(runtimeConfig.nativeAppStoreId || runtimeConfig.nativeAndroidPackageName),
    related_applications: [
      runtimeConfig.nativeAppStoreId
        ? {
          platform: "itunes",
          url: `https://apps.apple.com/app/id${runtimeConfig.nativeAppStoreId}`,
          id: runtimeConfig.nativeAppStoreId
        }
        : null,
      runtimeConfig.nativeAndroidPackageName
        ? {
          platform: "play",
          url: `https://play.google.com/store/apps/details?id=${runtimeConfig.nativeAndroidPackageName}`,
          id: runtimeConfig.nativeAndroidPackageName
        }
        : null
    ].filter(Boolean)
  } as MetadataRoute.Manifest;
}
