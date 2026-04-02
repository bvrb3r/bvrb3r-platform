import { runtimeConfig } from "@/lib/config/runtime";

function getIosAppId() {
  if (runtimeConfig.nativeIosTeamId && runtimeConfig.nativeIosBundleId) {
    return `${runtimeConfig.nativeIosTeamId}.${runtimeConfig.nativeIosBundleId}`;
  }

  return runtimeConfig.nativeIosBundleId || "";
}

export function buildAppleAppSiteAssociation() {
  const appId = getIosAppId();

  return {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: appId ? [appId] : [],
          components: [
            { "/": "/discover*" },
            { "/": "/booking/new*" },
            { "/": "/barber/*" },
            { "/": "/referrals*" },
            { "/": "/dashboard/client*" },
            { "/": "/dashboard/barber*" },
            { "/": "/dashboard/owner*" }
          ]
        }
      ]
    },
    webcredentials: {
      apps: appId ? [appId] : []
    }
  };
}

export function buildAndroidAssetLinks() {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: runtimeConfig.nativeAndroidPackageName,
        sha256_cert_fingerprints: runtimeConfig.nativeAndroidSha256 ? [runtimeConfig.nativeAndroidSha256] : []
      }
    }
  ];
}
