import type { Metadata } from "next";
import { MarketingPage, type MarketingPageContent } from "@/components/public-site/marketing-page";

export const metadata: Metadata = {
  title: "For Shops | BVRB3R",
  description: "Run the live floor, kiosk, team, per-barber service visibility, booth rent, and owner controls from one BVRB3R shop lane.",
  alternates: {
    canonical: "/for-shops"
  }
};

const content: MarketingPageContent = {
  active: "/for-shops",
  eyebrow: "Built for the whole floor",
  title: "Run every chair from one screen",
  description:
    "Live chairs, walk-in routing, each barber’s service price, team verification, Full Booth Rent, and AutoBooth Rent—one command center at the shop or away from it.",
  primaryCta: {
    href: "/signup?lane=shop_owner",
    label: "Sign up as a shop owner"
  },
  secondaryCta: {
    href: "/demo?role=owner",
    label: "Run the interactive demo"
  },
  problemEyebrow: "The floor without the chaos",
  problemTitle: "You shouldn’t have to stand at the desk to know what is happening.",
  problems: [
    {
      eyebrow: "Front desk",
      title: "Let the door check in.",
      body: "A PIN-protected kiosk lets walk-ins choose an eligible barber or the next available chair without borrowing staff time."
    },
    {
      eyebrow: "Empty chairs",
      title: "See capacity clearly.",
      body: "The floor view keeps chair, barber, queue, and relationship state visible so an open seat is not hidden in conversation."
    },
    {
      eyebrow: "Money truth",
      title: "Keep rent separate.",
      body: "Track Full Booth Rent and AutoBooth Rent as booth-rent receivables. Barber service proceeds and tips stay outside shop revenue."
    }
  ],
  flowEyebrow: "Owner command",
  flowTitle: "Floor day. Kiosk. Team. Rent.",
  steps: [
    {
      title: "Read the live floor",
      body: "See the shop’s chairs, eligible barbers, booked work, walk-in state, and operational blockers from one owner lane."
    },
    {
      title: "Open the kiosk",
      body: "Give the door a client-facing path with per-barber services and prices, next-available routing, privacy reset, and PIN-protected exit."
    },
    {
      title: "Build the verified team",
      body: "Invite barbers, review the relationship state, preserve each barber’s independent profile, and remove floor access cleanly when it ends."
    },
    {
      title: "Run the rent model",
      body: "Use Full Booth Rent for separately billed fixed rent, or AutoBooth Rent to apply an owner-approved portion of eligible proceeds toward outstanding rent. Both remain separate from barber service and tip money."
    }
  ],
  proofEyebrow: "One floor, clear ownership",
  proofTitle: "The shop controls the floor without owning the barber’s service price.",
  proofBody:
    "Each barber keeps their service menu and price. The owner controls shop eligibility, public team presence, kiosk access, and the chosen booth-rent relationship. Owner money reports show booth rent billed, paid, and outstanding; barber service proceeds and tips are excluded.",
  proofPoints: [
    "Kiosk shows each eligible barber’s active services and prices",
    "Next Available routes across eligible live chairs",
    "Team invites and approvals are auditable",
    "Full Booth Rent and AutoBooth Rent are the only financial models",
    "Owner money reports exclude barber service proceeds and tips"
  ],
  faqTitle: "Before you open the floor.",
  faqs: [
    {
      question: "Do barbers need their own accounts?",
      answer:
        "Yes. Each barber owns a verified barber lane with their services, prices, and schedule. The shop relationship connects that chair to the floor."
    },
    {
      question: "How does the kiosk price a cut?",
      answer:
        "The kiosk uses the selected barber’s eligible active service and price. Next Available routes to an eligible chair without inventing a shop-wide price."
    },
    {
      question: "Which shop–barber money models are supported?",
      answer:
        "Shop–barber relationships use Full Booth Rent or AutoBooth Rent only. The shop may report booth-rent receivables and shop-owned sales, but barber service proceeds and tips remain barber money."
    },
    {
      question: "What happens when a barber leaves?",
      answer:
        "The relationship can end, removing shop-floor eligibility and public team placement while the barber keeps their independent profile."
    }
  ],
  closingEyebrow: "Floor control without desk chaos",
  closingTitle: "Every chair visible. Every relationship clear",
  closingNote: "Kiosk-ready · Per-barber pricing · Full Booth Rent and AutoBooth Rent only"
};

export default function ForShopsPage() {
  return <MarketingPage content={content} />;
}
