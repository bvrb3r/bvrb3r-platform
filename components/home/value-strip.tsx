const values = [
  {
    title: "Booking",
    body: "Fast booking + walk-ins handled automatically"
  },
  {
    title: "Money",
    body: "Payments, payouts, and booth rent managed in one place"
  },
  {
    title: "Growth",
    body: "Clients, loyalty, and referrals built in"
  }
] as const;

export function ValueStrip() {
  return (
    <section className="page-shell pb-12 sm:pb-16" aria-labelledby="home-value-title">
      <h2 id="home-value-title" className="sr-only">
        Platform value
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {values.map((value) => (
          <article
            key={value.title}
            className="rounded-[28px] border border-white/8 bg-white/[0.035] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)] backdrop-blur-md sm:p-6"
          >
            <h3 className="text-2xl font-semibold text-white" data-display="true">
              {value.title}
            </h3>
            <p className="mt-4 text-sm leading-7 text-white/62">{value.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
