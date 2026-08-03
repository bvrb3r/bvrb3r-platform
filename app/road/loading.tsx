export default function RoadLoading() {
  return (
    <main className="bvr-screen" aria-busy="true" aria-label="Loading The Road">
      <div className="mx-auto w-full max-w-[1120px] animate-pulse px-4 py-8 sm:px-7">
        <div className="h-11 w-64 rounded-full bg-white/[0.06]" />
        <div className="mt-12 h-12 w-full max-w-xl rounded-2xl bg-white/[0.06]" />
        <div className="mt-4 h-5 w-full max-w-2xl rounded bg-white/[0.04]" />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-28 rounded-[22px] border border-white/10 bg-white/[0.03]" />)}
        </div>
        <div className="mt-10 space-y-4">
          {[0, 1, 2].map((item) => <div key={item} className="h-64 rounded-[24px] border border-white/10 bg-white/[0.03]" />)}
        </div>
      </div>
    </main>
  );
}
