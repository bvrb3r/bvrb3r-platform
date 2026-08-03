import type { Metadata } from "next";
import { MarketingPage, type MarketingPageContent } from "@/components/public-site/marketing-page";

export const metadata: Metadata = {
  title: "For Barbers | BVRB3R",
  description: "Run your chair, services, schedule, walk-in day, clients, and money truth from one BVRB3R barber lane.",
  alternates: {
    canonical: "/for-barbers"
  }
};

const content: MarketingPageContent = {
  active: "/for-barbers",
  eyebrow: "Built for the chair",
  title: "Your chair, always moving",
  description:
    "BVRB3R turns your profile, services, schedule, bookings, walk-ins, clients, and money truth into one barber command lane—without taking over your craft.",
  primaryCta: {
    href: "/signup?lane=barber",
    label: "Sign up as a barber"
  },
  secondaryCta: {
    href: "/demo?role=barber",
    label: "Run the interactive demo"
  },
  problemEyebrow: "The expensive gaps",
  problemTitle: "Empty minutes are the most expensive thing in the shop.",
  problems: [
    {
      eyebrow: "No-shows",
      title: "Protect the slot.",
      body: "Set a clear cancellation window and no-show policy so clients see the terms before the appointment is confirmed."
    },
    {
      eyebrow: "Dead gaps",
      title: "Expose the real chair.",
      body: "Clients see active services and actual openings instead of starting another round of late-night scheduling messages."
    },
    {
      eyebrow: "Chasing DMs",
      title: "Turn work into a door.",
      body: "Your public profile and Culture work point clients toward your live booking path instead of an inbox."
    }
  ],
  flowEyebrow: "Your business flow",
  flowTitle: "Profile. Bookings. Queue day. Insight.",
  steps: [
    {
      title: "Publish your chair",
      body: "Set your identity, service menu, pricing, location, availability, and booking policy in one verified profile."
    },
    {
      title: "Run the booked day",
      body: "See the schedule, protect active time, confirm lifecycle changes, and keep client context close to the appointment."
    },
    {
      title: "Open the walk-in line",
      body: "Use your barber kiosk and queue day when the chair is taking walk-ins—without stopping the cut to work the door."
    },
    {
      title: "Read the business",
      body: "Review completed work, client rhythm, and the ledger attached to your chair without rebuilding the day from messages."
    }
  ],
  proofEyebrow: "Your chair stays yours",
  proofTitle: "Your prices. Your schedule. 100% of your tips.",
  proofBody:
    "The BVRB3R platform fee is 5% of eligible transactions. 100% of the client-confirmed tip belongs to the barber. Stripe processing charges and other authorized adjustments are disclosed separately, and payout timing depends on Stripe Connect eligibility and settlement conditions. When a shop relationship exists, Full Booth Rent and AutoBooth Rent are the only supported models.",
  proofPoints: [
    "You set active services, duration, and pricing",
    "You control availability, buffers, and booking policy",
    "BVRB3R platform fee: 5% of eligible transactions",
    "100% of the client-confirmed tip belongs to the barber",
    "Payout timing follows Stripe Connect eligibility and settlement conditions",
    "Shop relationships use Full Booth Rent or AutoBooth Rent only"
  ],
  faqTitle: "Before you move your chair.",
  faqs: [
    {
      question: "Do I keep my own prices?",
      answer:
        "Yes. You set services, price, duration, schedule, and policy. The same service truth follows your profile, booking path, and eligible kiosk surfaces."
    },
    {
      question: "Does my shop need to join too?",
      answer:
        "No. An eligible independent barber can run a standalone chair. If a shop relationship is added later, the barber keeps the profile and service history."
    },
    {
      question: "How does the shop relationship work?",
      answer:
        "Full Booth Rent bills the agreed rent separately. AutoBooth Rent applies an owner-approved portion of eligible proceeds toward outstanding booth rent and stops when that rent is settled. Barber service proceeds and tips are never shop revenue."
    },
    {
      question: "What does BVRB3R charge, and when do payouts arrive?",
      answer:
        "BVRB3R charges a 5% platform fee on eligible transactions. Stripe processing charges, taxes, refunds, disputes, and other authorized adjustments are shown separately when they apply. Payout timing depends on Stripe Connect account eligibility, settlement, payout schedule, risk holds, weekends, and bank timing."
    },
    {
      question: "What happens to my regulars?",
      answer:
        "Your public profile remains the stable client door. Clients can favorite, book, and return through the barber identity they already know."
    }
  ],
  closingEyebrow: "The craft stays in front",
  closingTitle: "Work the chair. Let the system hold the day",
  closingNote: "Runs in your browser · Independent and shop-linked lanes supported"
};

export default function ForBarbersPage() {
  return <MarketingPage content={content} />;
}
