const appId = process.env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME || "com.bvrb3r.platform";
const appName = process.env.NEXT_PUBLIC_APP_NAME || "BVRB3R Platform";
const serverUrl = process.env.CAPACITOR_SERVER_URL || "";
const usesRemoteServer = Boolean(serverUrl);
const webDir = "dist/capacitor";

function resolveServerHost(url: string) {
  if (!url) {
    return "";
  }

  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

const serverHost = usesRemoteServer ? resolveServerHost(serverUrl) : "";

const config = {
  appId,
  appName,
  webDir,
  bundledWebRuntime: false,
  server: {
    androidScheme: "https",
    url: usesRemoteServer ? serverUrl : undefined,
    cleartext: usesRemoteServer ? serverUrl.startsWith("http://") : false,
    allowNavigation: usesRemoteServer && serverHost ? [serverHost] : undefined
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    },
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: "#050505"
    },
    App: {
      launchUrl: `${process.env.NEXT_PUBLIC_APP_LINK_SCHEME || "bvrb3r"}://open?href=%2Fdiscover`
    }
  },
  ios: {
    contentInset: "automatic"
  },
  android: {
    allowMixedContent: usesRemoteServer ? serverUrl.startsWith("http://") : false
  }
};

export default config;
