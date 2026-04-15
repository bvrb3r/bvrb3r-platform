export function HomeHero() {
  return (
    <section className="max-w-3xl lg:pb-10" aria-labelledby="home-hero-title">
      <h1
        id="home-hero-title"
        className="text-balance text-[clamp(3.1rem,15vw,5.65rem)] font-semibold leading-[0.88] text-white sm:text-[clamp(4.25rem,11vw,7.6rem)] lg:max-w-[11ch]"
        data-display="true"
      >
        Run your chair, your shop, and your income — in one system.
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-white/66 sm:text-xl sm:leading-9">
        Booking. Payments. Clients. All controlled.
      </p>
    </section>
  );
}
