import { Card } from "@/components/ui/card";

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="flex min-h-48 flex-col items-center justify-center rounded-[28px] border-dashed text-center">
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="mt-3 max-w-md text-sm text-white/60">{body}</p>
    </Card>
  );
}