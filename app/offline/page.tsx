import { OfflineSafetyScreen } from "@/components/ui/offline-safety-screen";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#060708] px-4 py-10 text-[#F5F1E8]">
      <OfflineSafetyScreen />
    </main>
  );
}
