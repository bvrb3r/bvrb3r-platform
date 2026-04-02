import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { runtimeConfig } from "@/lib/config/runtime";

export function getMediaBucketName() {
  return runtimeConfig.mediaBucket;
}

export async function uploadMediaAsset(path: string, file: File) {
  const client = createSupabaseBrowserClient();
  if (!client) {
    return {
      mode: "demo" as const,
      path,
      publicUrl: `/mock-storage/${path}`
    };
  }

  const bucket = getMediaBucketName();
  const { error } = await client.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) {
    throw error;
  }

  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return {
    mode: "supabase" as const,
    path,
    publicUrl: data.publicUrl
  };
}