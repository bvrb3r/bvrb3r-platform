"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, CreditCard, Scissors } from "lucide-react";
import styles from "./square-booking-welcome.module.css";

// Observed via the shop's owner-supplied Square link on 2026-10-28.
// Use Square's live menu; never duplicate prices, availability or customer data.
export const SHOP_SQUARE_BOOKING_URL =
  "https://book.squareup.com/appointments/kb47sx4fuevpak/location/LQQVQXJC0BSHF/services";

export function SquareBookingWelcome() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    window.addEventListener("pageshow", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      window.removeEventListener("pageshow", updateConnection);
    };
  }, []);

  return (
    <main className={styles.screen} data-kiosk-surface aria-labelledby="square-kiosk-title">
      <header className={styles.header}>
        <span className={styles.wordmark}>BVRB3R<span aria-hidden="true">™</span></span>
        <span className={styles.location}>THE SHOP / TAMPA, FL</span>
      </header>

      <section className={styles.welcome}>
        <p className={styles.eyebrow}><span aria-hidden="true" /> MAKE YOURSELF AT HOME</p>
        <h1 id="square-kiosk-title" className={styles.title}>
          Welcome to<br />The BVRB3R Shop<span className={styles.period}>.</span>
        </h1>
        <p className={styles.intro}>
          A fresh cut starts here. Choose your service,<br className={styles.desktopBreak} /> find your time, and book with Square.
        </p>

        <div className={styles.action}>
          {online ? (
            <a className={styles.book} href={SHOP_SQUARE_BOOKING_URL} referrerPolicy="no-referrer">
              Book Appointment <ArrowRight aria-hidden="true" size={25} />
            </a>
          ) : (
            <button className={styles.book} disabled>
              Waiting for connection
            </button>
          )}
          <p className={styles.hint} role="status" aria-live="polite">
            {online
              ? "Continue to our booking page on Square."
              : "This iPad is offline. Booking will be available when it reconnects."}
          </p>
        </div>

        <ol className={styles.steps} aria-label="How to book">
          <li><Scissors aria-hidden="true" /><span><small>01</small>Choose your service</span></li>
          <li><CalendarDays aria-hidden="true" /><span><small>02</small>Find your time</span></li>
          <li><CreditCard aria-hidden="true" /><span><small>03</small>Enter details &amp; pay</span></li>
        </ol>
      </section>

      <footer className={styles.footer}>
        <p>Come for the cut. <span>Stay for the culture.</span></p>
        <span className={styles.footerLabel}>THE BVRB3R SHOP & CO.</span>
      </footer>
    </main>
  );
}
