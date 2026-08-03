import type { Metadata } from "next";
import { MarketingPage, type MarketingPageContent } from "@/components/public-site/marketing-page";

export const metadata: Metadata = {
  title: "The App | BVRB3R",
  description: "Find a barber, book a real chair, follow the live walk-in line, and manage the cut from one BVRB3R app.",
  alternates: {
    canonical: "/app"
  }
};

const content: MarketingPageContent = {
  active: "/app",
  eyebrow: "BVRB3R for clients",
  title: "The cut you want. The chair that’s ready",
  description:
    "No calls. No “you got a slot today?” texts. BVRB3R shows real chairs at real times—book one, join the live walk-in line, and keep the whole appointment in one place.",
  primaryCta: {
    href: "/booking/new",
    label: "Book a cut"
  },
  secondaryCta: {
    href: "/discover?entry=guest",
    label: "Enter as guest"
  },
  problemEyebrow: "Why BVRB3R",
  problemTitle: "The old way makes a simple cut feel like coordination work.",
  problems: [
    {
      eyebrow: "Booking",
      title: "Book the chair.",
      body: "See active services, real availability, clear prices, and the barber’s policy before you confirm."
    },
    {
      eyebrow: "Walk-ins",
      title: "See the line.",
      body: "Join a shop’s live queue and follow your place instead of spending the afternoon in a waiting chair."
    },
    {
      eyebrow: "After the cut",
      title: "Stay in rhythm.",
      body: "Keep appointments, receipts, favorites, and the next rebook path together in your client lane."
    }
  ],
  flowEyebrow: "How it works",
  flowTitle: "Find. Book. Sit.",
  steps: [
    {
      title: "Find your barber",
      body: "Search by barber, shop, service, or the work that caught your eye in Culture. Profiles show the details up front."
    },
    {
      title: "Book it—or walk in",
      body: "Choose a real time or join a live shop queue. The same booking truth follows you from discovery to the chair."
    },
    {
      title: "Sit down. It’s handled.",
      body: "Get reminders, manage a reschedule or cancellation, and keep the appointment history ready for the next cut."
    }
  ],
  proofEyebrow: "Trust before checkout",
  proofTitle: "Know who you’re booking and what you’re agreeing to.",
  proofBody:
    "BVRB3R puts verification, service details, pricing, and each barber’s cancellation terms in the booking path—before a client commits.",
  proofPoints: [
    "Barber and shop verification states are visible",
    "Prices and service duration appear before confirmation",
    "No-show and cancellation terms stay attached to the booking",
    "Guest discovery remains open before signup"
  ],
  faqTitle: "Before your first cut.",
  faqs: [
    {
      question: "What does Client Standard cost?",
      answer: "Client Standard is $0. Guests can also explore barbers, shops, and Culture before creating a saved client lane."
    },
    {
      question: "Do I need an account to book?",
      answer:
        "Guest booking can begin without a login. BVRB3R resolves the client securely during the flow so the appointment can be confirmed and recovered."
    },
    {
      question: "Can I cancel or reschedule?",
      answer:
        "Yes. Confirmed bookings carry the barber’s policy and can use the canonical cancel or reschedule path when the policy allows it."
    },
    {
      question: "How does the walk-in queue work?",
      answer:
        "Join through the app or a shop kiosk, then follow the live status for that floor instead of guessing from the waiting room."
    }
  ],
  closingEyebrow: "The chair is closer than it looks",
  closingTitle: "Your next cut starts here",
  closingNote: "Client Standard $0 · Guest entry available · Built for mobile and web"
};

export default function AppMarketingPage() {
  return <MarketingPage content={content} />;
}
