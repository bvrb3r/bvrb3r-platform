import { verifyArchitectMetadata } from "../lib/auth/architect-metadata-verification";

async function main() {
  const report = await verifyArchitectMetadata();

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Architect metadata verification failed.");
  process.exitCode = 1;
});
