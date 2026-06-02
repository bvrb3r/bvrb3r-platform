import { runtimeConfig } from "@/lib/config/runtime";

type StorageUrlClient = {
  storage: {
    from: (bucket: string) => {
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
};

function isAbsoluteMediaUrl(value: string) {
  return /^https?:\/\//i.test(value) || value.startsWith("/mock-storage/");
}

export function toPublicMediaUrl(client: StorageUrlClient | null, storagePath?: string | null, imageUrl?: string | null) {
  const cleanImageUrl = imageUrl?.trim();
  if (cleanImageUrl) {
    return cleanImageUrl;
  }

  const cleanStoragePath = storagePath?.trim();
  if (!cleanStoragePath) {
    return undefined;
  }

  if (isAbsoluteMediaUrl(cleanStoragePath) || !client) {
    return cleanStoragePath;
  }

  const { data } = client.storage.from(runtimeConfig.mediaBucket).getPublicUrl(cleanStoragePath);
  return data.publicUrl || cleanStoragePath;
}
