import type { Route } from "next";
import Link from "next/link";
import { PublicFooter } from "./public-footer";
import { PublicNav } from "./public-nav";
import styles from "./public-site.module.css";

type MarketingCard = {
  eyebrow: string;
  title: string;
  body: string;
};

type MarketingStep = {
  title: string;
  body: string;
};

type MarketingFaq = {
  question: string;
  answer: string;
};

export type MarketingPageContent = {
  active: "/app" | "/for-barbers" | "/for-shops";
  eyebrow: string;
  title: string;
  description: string;
  primaryCta: { href: Route; label: string };
  secondaryCta: { href: Route; label: string };
  problemEyebrow: string;
  problemTitle: string;
  problems: MarketingCard[];
  flowEyebrow: string;
  flowTitle: string;
  steps: MarketingStep[];
  proofEyebrow: string;
  proofTitle: string;
  proofBody: string;
  proofPoints: string[];
  faqTitle: string;
  faqs: MarketingFaq[];
  closingEyebrow: string;
  closingTitle: string;
  closingNote: string;
};

export function MarketingPage({ content }: { content: MarketingPageContent }) {
  return (
    <div className={styles.marketingPage}>
      <PublicNav active={content.active} />
      <main>
        <section className={styles.marketingHero}>
          <div className={styles.ambientOrb} aria-hidden="true" />
          <p className={styles.kicker}>{content.eyebrow}</p>
          <h1>
            {content.title}
            <span>.</span>
          </h1>
          <p className={styles.heroDescription}>{content.description}</p>
          <div className={styles.heroActions}>
            <Link href={content.primaryCta.href} className={styles.largePrimary}>
              {content.primaryCta.label} <span aria-hidden="true">→</span>
            </Link>
            <Link href={content.secondaryCta.href} className={styles.largeSecondary}>
              {content.secondaryCta.label}
            </Link>
          </div>
        </section>

        <section className={styles.marketingSection}>
          <p className={styles.kicker}>{content.problemEyebrow}</p>
          <h2>{content.problemTitle}</h2>
          <div className={styles.problemGrid}>
            {content.problems.map((problem) => (
              <article key={problem.title} className={styles.problemCard}>
                <p>{problem.eyebrow}</p>
                <h3>{problem.title}</h3>
                <div className={styles.cardRule} aria-hidden="true" />
                <p>{problem.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.marketingSection} ${styles.flowSection}`}>
          <p className={styles.kicker}>{content.flowEyebrow}</p>
          <h2>{content.flowTitle}</h2>
          <ol className={styles.stepList}>
            {content.steps.map((step, index) => (
              <li key={step.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={`${styles.marketingSection} ${styles.proofSection}`}>
          <div>
            <p className={styles.kicker}>{content.proofEyebrow}</p>
            <h2>{content.proofTitle}</h2>
            <p className={styles.proofBody}>{content.proofBody}</p>
          </div>
          <ul className={styles.proofList}>
            {content.proofPoints.map((point) => (
              <li key={point}>
                <span aria-hidden="true">●</span>
                {point}
              </li>
            ))}
          </ul>
        </section>

        <section className={`${styles.marketingSection} ${styles.faqSection}`}>
          <p className={styles.kicker}>The questions people ask</p>
          <h2>{content.faqTitle}</h2>
          <div className={styles.faqList}>
            {content.faqs.map((faq) => (
              <details key={faq.question}>
                <summary>
                  {faq.question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.marketingCta}>
          <p className={styles.kicker}>{content.closingEyebrow}</p>
          <h2>
            {content.closingTitle}
            <span>.</span>
          </h2>
          <Link href={content.primaryCta.href} className={styles.largePrimary}>
            {content.primaryCta.label} <span aria-hidden="true">→</span>
          </Link>
          <p>{content.closingNote}</p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
