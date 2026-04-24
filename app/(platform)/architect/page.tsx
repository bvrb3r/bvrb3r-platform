import { ArchitectConsole } from "@/components/operations/architect-console";
import { loadArchitectConsoleInitialData } from "@/app/(platform)/architect/_console-data";

export default async function ArchitectPage() {
  const initialData = await loadArchitectConsoleInitialData();

  return <ArchitectConsole initialData={initialData} mode="home" />;
}
