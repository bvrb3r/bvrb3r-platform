export default function AppIdentityLoading() {
  return (
    <main className="min-h-screen bg-[#060708] px-5 py-8 text-[#F5F1E8]" aria-busy="true">
      <div className="mx-auto max-w-[960px] animate-pulse">
        <div className="h-8 w-72 rounded-full bg-white/[0.06]" />
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <div className="mx-auto aspect-[63/98] w-full max-w-[340px] rounded-[26px] bg-white/[0.05]" />
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="h-24 rounded-2xl bg-white/[0.04]" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
