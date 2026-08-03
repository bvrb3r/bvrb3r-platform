import Link from "next/link";
import styles from "./public-site.module.css";

const navigation = [
  { href: "/app", label: "The App" },
  { href: "/culture", label: "Culture" },
  { href: "/for-barbers", label: "For Barbers" },
  { href: "/for-shops", label: "For Shops" }
] as const;

type PublicNavProps = {
  active?: "/app" | "/culture" | "/discover" | "/for-barbers" | "/for-shops";
};

export function PublicNav({ active }: PublicNavProps) {
  return (
    <header className={styles.publicHeader}>
      <nav aria-label="Public" className={styles.publicNav}>
        <div className={styles.navStart}>
          <Link href="/" aria-label="BVRB3R home" className={styles.wordmark}>
            BVRB<span>3</span>R
          </Link>
          <div className={styles.desktopLinks}>
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active === item.href ? "page" : undefined}
                className={active === item.href ? styles.activeNavLink : styles.navLink}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className={styles.desktopActions}>
          <Link href="/discover?entry=guest" aria-current={active === "/discover" ? "page" : undefined} className={styles.guestLink}>
            Enter as guest
          </Link>
          <Link href="/for-barbers" className={styles.barberLink}>
            I&apos;m a barber
          </Link>
          <Link href="/login" className={styles.secondaryPill}>
            Sign in
          </Link>
          <Link href="/app" className={styles.primaryPill}>
            Get the app
          </Link>
        </div>

        <details className={styles.mobileMenu}>
          <summary>Menu</summary>
          <div className={styles.mobileMenuPanel}>
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active === item.href ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
            <Link href="/discover?entry=guest" aria-current={active === "/discover" ? "page" : undefined}>Enter as guest</Link>
            <Link href="/login">Sign in</Link>
            <Link href="/signup?lane=client" className={styles.mobilePrimary}>
              Join BVRB3R
            </Link>
          </div>
        </details>
      </nav>
    </header>
  );
}
