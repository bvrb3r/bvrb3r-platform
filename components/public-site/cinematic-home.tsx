import Link from "next/link";
import { CinematicEffects } from "./cinematic-effects";
import { PublicFooter } from "./public-footer";
import { PublicNav } from "./public-nav";
import styles from "./public-site.module.css";

const revealCards = [
  {
    eyebrow: "Book fast",
    title: "Booked in seconds.",
    body: "Real services, real times, and a protected slot while you finish the booking."
  },
  {
    eyebrow: "Culture",
    title: "The feed that books.",
    body: "See work you love, open the barber behind it, and move straight into their chair."
  },
  {
    eyebrow: "One system",
    title: "Client. Barber. Owner.",
    body: "Three focused lanes connected from first discovery to the close of the floor."
  }
] as const;

export function CinematicHome({ signupEnabled = true }: { signupEnabled?: boolean }) {
  return (
    <div className={styles.cinematicPage} data-public-site>
      <PublicNav />
      <CinematicEffects />

      <main className={styles.cinematicMain}>
        <section className={`${styles.cinematicSection} ${styles.cinematicHero}`}>
          <div>
            <p className={styles.kicker}>The future of barbering</p>
            <h1 aria-label="Every great cut starts with a spin.">
              Every great cut starts with a spin<span>.</span>
            </h1>
            <p className={styles.cinematicLead}>
              The barber pole has announced the chair for centuries. BVRB3R turns that signal into a live system for finding,
              booking, and running the whole floor.
            </p>
            <div className={styles.heroActions}>
              <Link href="/booking/new" className={styles.largePrimary}>
                Book a cut <span aria-hidden="true">→</span>
              </Link>
              <Link href="/discover?entry=guest" className={styles.largeSecondary}>
                Enter as guest
              </Link>
            </div>
            <p className={styles.scrollHint}>
              Scroll to spin <span aria-hidden="true">↓</span>
            </p>
          </div>
        </section>

        <section className={styles.cinematicSection}>
          <div>
            <p className={styles.kicker}>The comet</p>
            <h2 aria-label="Booking apps treat the shop like a calendar.">
              Booking apps treat the shop like a calendar<span>.</span>
            </h2>
            <p className={styles.cinematicLead}>
              A shop is a live floor: chairs opening, walk-ins arriving, clients rebooking, and barbers building a name. The
              whole industry deserves one connected system.
            </p>
          </div>
        </section>

        <section className={styles.cinematicSection}>
          <div>
            <p className={styles.kicker}>Impact</p>
            <h2 aria-label="The BVRB3R app just hit the industry.">
              The BVRB3R app just hit the industry<span>.</span>
            </h2>
            <p className={styles.cinematicLead}>
              Discovery becomes a booking. A walk-in becomes a visible place in line. The floor stays readable without turning
              the craft into desk work.
            </p>
          </div>
        </section>

        <section className={styles.cinematicSection}>
          <div>
            <p className={styles.kicker}>Inside the signal</p>
            <h2 aria-label="Everything the shop runs on.">
              Everything the shop runs on<span>.</span>
            </h2>
            <p className={styles.cinematicLead}>
              One clear client door, a barber command lane, and an owner floor view—each focused, all sharing the same truth.
            </p>
            <div className={styles.revealGrid}>
              {revealCards.map((card) => (
                <article key={card.title} className={styles.revealCard}>
                  <p>{card.eyebrow}</p>
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={`${styles.cinematicSection} ${styles.cinematicFinal}`}>
          <div>
            <p className={styles.kicker}>No waiting on the old way</p>
            <h2 aria-label="Your next cut is already waiting.">
              Your next cut is already waiting<span>.</span>
            </h2>
            <p className={styles.cinematicLead}>
              Browse the culture, find the chair, and book the service that fits. Client Standard is $0, and guest discovery
              stays open in your browser.
            </p>
            {signupEnabled ? (
              <div className={styles.heroActions}>
                <Link href="/booking/new" className={styles.largePrimary}>
                  Book a cut <span aria-hidden="true">→</span>
                </Link>
                <Link href="/discover?entry=guest" className={styles.largeSecondary}>
                  Enter as guest
                </Link>
              </div>
            ) : (
              <div className={styles.heroActions}>
                <Link href="/login" className={styles.largePrimary}>
                  Owner review sign in <span aria-hidden="true">→</span>
                </Link>
              </div>
            )}
            <p className={styles.cinematicNote}>
              {signupEnabled
                ? "Client Standard $0 · Nothing to install · Guest browsing stays open"
                : "Private production review · Approved test accounts only"}
            </p>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
