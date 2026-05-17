export function readArchitectDebugEnvironment() {
  return {
    appEnv: process.env.NEXT_PUBLIC_APP_ENV
      ?? process.env.VERCEL_ENV
      ?? process.env.NODE_ENV
      ?? "unknown",
    commitHash: process.env.VERCEL_GIT_COMMIT_SHA
      ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
      ?? process.env.NEXT_PUBLIC_COMMIT_SHA
      ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID
      ?? process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID
      ?? null
  };
}
