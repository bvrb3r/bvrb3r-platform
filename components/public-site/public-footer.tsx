import Link from "next/link";
import styles from "./public-site.module.css";

export function PublicFooter() {
  return (
    <footer className={styles.publicFooter}>
      <Link href="/" aria-label="BVRB3R home" className={styles.wordmark}>
        BVRB<span>3</span>R
      </Link>
      <nav aria-label="Footer" className={styles.footerLinks}>
        <Link href="/app">The App</Link>
        <Link href="/discover?entry=guest">Culture</Link>
        <Link href="/for-barbers">For Barbers</Link>
        <Link href="/for-shops">For Shops</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </nav>
      <p>Built for the chair, the floor, and the culture.</p>
    </footer>
  );
}
