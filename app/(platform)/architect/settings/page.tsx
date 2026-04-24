import { ArchitectConsole } from "@/components/operations/architect-console";
import { loadArchitectConsoleInitialData } from "@/app/(platform)/architect/_console-data";

export default async function ArchitectSettingsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initialData = await loadArchitectConsoleInitialData();
  const resolved = searchParams ? await searchParams : undefined;
  const section = typeof resolved?.section === "string" ? resolved.section : undefined;

  return <ArchitectConsole initialData={initialData} mode="settings" focusSection={section} />;
}
