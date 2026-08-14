export const ROAD_ROLES = ["client_user", "barber_user", "shop_owner_user"] as const;

export type RoadRole = (typeof ROAD_ROLES)[number];

export type RoadAchievementDefinition = {
  key: string;
  label: string;
  detail: string;
};

export type RoadSetDefinition = {
  index: number;
  code: string;
  name: string;
  subtitle: string;
  unlocks: string;
  badgeName: string;
  badgeReward: string;
  achievements: readonly RoadAchievementDefinition[];
};

export type RoadDefinition = {
  role: RoadRole;
  label: string;
  title: string;
  subtitle: string;
  summit: string;
  sets: readonly RoadSetDefinition[];
};

function achievement(key: string, label: string, detail: string): RoadAchievementDefinition {
  return { key, label, detail };
}

export const ROAD_DEFINITIONS = {
  client_user: {
    role: "client_user",
    label: "Client",
    title: "The Client Road",
    subtitle: "From the front door to full V3 membership — every cut, review, and streak moves you up.",
    summit: "V3 Member — loyalty perks, concierge booking, marketplace",
    sets: [
      {
        index: 0,
        code: "SET 0",
        name: "The Door",
        subtitle: "Sign up",
        unlocks: "Opens: booking",
        badgeName: "Doorstep",
        badgeReward: "Welcome flair on your profile",
        achievements: [
          achievement("client.account_created", "Create account", "Phone or email — 30 seconds, no forms wall"),
          achievement("client.contact_verified", "Verify contact", "Verified email + phone are the identity truth"),
          achievement("client.username_claimed", "Pick a username", "How the culture knows you"),
          achievement("client.guest_visits_claimed", "Resolve guest history", "Claim eligible walk-ins, or verify that there is no guest history to merge")
        ]
      },
      {
        index: 1,
        code: "SET 1",
        name: "First Cut",
        subtitle: "The core loop, once",
        unlocks: "Opens: rebook + favorites",
        badgeName: "Fresh Fade",
        badgeReward: "One-tap rebook + your review voice",
        achievements: [
          achievement("client.profile_completed", "Complete profile", "Photo + preferences"),
          achievement("client.payment_method_saved", "Save a payment method", "Card on file — checkout becomes one tap"),
          achievement("client.first_booking_created", "Book first appointment", "Search → barber → time → confirmed"),
          achievement("client.first_cut_completed", "First cut completed", "The chair, for real"),
          achievement("client.first_review_published", "Leave first review", "Stars + words — published to the profile"),
          achievement("client.first_barber_favorited", "Favorite a barber", "The loyalty seed")
        ]
      },
      {
        index: 2,
        code: "SET 2",
        name: "The Regular",
        subtitle: "Habit forms",
        unlocks: "Opens: Culture posting + streaks",
        badgeName: "The Regular",
        badgeReward: "Streak shield — one missed week forgiven",
        achievements: [
          achievement("client.same_barber_rebooked", "Rebook the same barber", "One tap from the last cut"),
          achievement("client.three_cuts_completed", "3 cuts completed", "The rhythm is real"),
          achievement("client.notifications_enabled", "Turn on notifications", "Reminders, queue calls, receipts"),
          achievement("client.five_barbers_followed", "Follow 5 barbers", "The feed becomes yours"),
          achievement("client.first_like_and_comment", "First like + comment", "Enter the conversation")
        ]
      },
      {
        index: 3,
        code: "SET 3",
        name: "Culture",
        subtitle: "The social layer",
        unlocks: "Opens: V3 membership invite",
        badgeName: "Tastemaker",
        badgeReward: "Priority booking windows",
        achievements: [
          achievement("client.culture_booking_completed", "Book from a Culture post", "The feed sells the chair"),
          achievement("client.first_post_shared", "Share a post", "Bring someone into the culture"),
          achievement("client.five_cut_streak", "5-cut streak", "Loyalty streak alive"),
          achievement("client.first_in_app_tip", "Tip through the app", "100% to the barber, always"),
          achievement("client.first_referral_counted", "Refer a friend", "They finish SET 1, you both win")
        ]
      },
      {
        index: 4,
        code: "SET 4",
        name: "V3 Member",
        subtitle: "Full subscription",
        unlocks: "The summit — all doors open",
        badgeName: "Gold Member",
        badgeReward: "Concierge, marketplace & member perks",
        achievements: [
          achievement("client.membership_activated", "Activate membership", "Loyalty perks + priority booking"),
          achievement("client.first_cut_gifted", "Gift your first cut", "Cover a stranger’s chair — the V3 gifting door"),
          achievement("client.first_concierge_booking", "First concierge booking", "“Get me a fade Friday” — done"),
          achievement("client.first_marketplace_order", "First marketplace order", "Product from your barber’s shelf"),
          achievement("client.ten_cut_streak", "Keep a 10-cut streak", "The regular’s regular")
        ]
      }
    ]
  },
  barber_user: {
    role: "barber_user",
    label: "Barber",
    title: "The Barber Road",
    subtitle: "From a username to a full business on BVRB3R — verified, booked, synced, and running on Full Booth Rent or AutoBooth Rent.",
    summit: "V3 Pro — growth engine, analytics, AutoBooth",
    sets: [
      {
        index: 0,
        code: "SET 0",
        name: "The Chair",
        subtitle: "Sign up",
        unlocks: "Opens: verification",
        badgeName: "Claimed Chair",
        badgeReward: "@username locked, profile page live",
        achievements: [
          achievement("barber.account_created", "Create account", "Role: barber"),
          achievement("barber.username_claimed", "Pick your @username", "Your name on the door"),
          achievement("barber.contact_verified", "Verify contact", "Verified email + phone protect the chair")
        ]
      },
      {
        index: 1,
        code: "SET 1",
        name: "Verified",
        subtitle: "Compliance first",
        unlocks: "Opens: bookings",
        badgeName: "Licensed & Verified",
        badgeReward: "Verified badge clients can trust",
        achievements: [
          achievement("barber.license_verified", "License verified", "Upload → reviewed → badge"),
          achievement("barber.payout_connected", "Stripe payout connected", "Where the money lands"),
          achievement("barber.menu_built", "Build the menu", "3+ services with price + duration"),
          achievement("barber.availability_published", "Set availability", "Weekly hours + breaks"),
          achievement("barber.profile_published", "Publish profile", "Photo + 3 portfolio posts")
        ]
      },
      {
        index: 2,
        code: "SET 2",
        name: "Open for Business",
        subtitle: "The first money",
        unlocks: "Opens: kiosk + queue tools",
        badgeName: "First Money",
        badgeReward: "Kiosk mode + rebook links unlocked",
        achievements: [
          achievement("barber.first_booking_received", "First booking received", "The calendar is alive"),
          achievement("barber.first_checkout_completed", "First checkout completed", "Service → tip → paid"),
          achievement("barber.first_tip_received", "First tip", "100% yours — doctrine"),
          achievement("barber.walk_ins_enabled", "Turn on walk-ins", "Start / pause / stop control"),
          achievement("barber.kiosk_activated", "Activate kiosk mode", "Hands stay on the clippers"),
          achievement("barber.first_rebook_sent", "Send first rebook link", "Wrap a client, lock the next one")
        ]
      },
      {
        index: 3,
        code: "SET 3",
        name: "The Operator",
        subtitle: "Synced + converting",
        unlocks: "Opens: V3 Pro invite",
        badgeName: "The Operator",
        badgeReward: "ChairSync + ClientBridge tools",
        achievements: [
          achievement("barber.chairsync_connected", "Connect ChairSync", "Booksy / Square / theCut in one calendar"),
          achievement("barber.first_clientbridge_conversion", "First ClientBridge conversion", "External guest → BVRB3R client"),
          achievement("barber.twenty_five_cuts_completed", "25 cuts completed", "Proven volume"),
          achievement("barber.first_culture_post_published", "First Culture post", "Your work, on the feed"),
          achievement("barber.relationship_decided", "Join a shop (or stay solo)", "Full Booth Rent / AutoBooth Rent agreement signed — if a floor calls")
        ]
      },
      {
        index: 4,
        code: "SET 4",
        name: "V3 Pro",
        subtitle: "Full subscription",
        unlocks: "The summit — the whole business runs here",
        badgeName: "Master of the Craft",
        badgeReward: "Analytics, growth engine & AutoBooth",
        achievements: [
          achievement("barber.pro_activated", "Activate Pro", "Analytics + growth engine unlocked"),
          achievement("barber.first_gifted_cut_received", "First gifted cut received", "The community filled your chair"),
          achievement("barber.autobooth_authorized", "AutoBooth authorized", "Rent pays itself, capped, transparent"),
          achievement("barber.rent_autopay_enabled", "Rent AutoPay on", "Never think about rent day again"),
          achievement("barber.hundred_cuts_completed", "100 cuts completed", "The chair is a business")
        ]
      }
    ]
  },
  shop_owner_user: {
    role: "shop_owner_user",
    label: "Shop Owner",
    title: "The Shop Owner Road",
    subtitle: "From the keys to an empire — verified shop, staffed floor, live kiosk, and rent that reconciles to $0.00.",
    summit: "Elite — multi-shop, AutoBooth, full reports",
    sets: [
      {
        index: 0,
        code: "SET 0",
        name: "The Keys",
        subtitle: "Sign up",
        unlocks: "Opens: verification",
        badgeName: "Keyholder",
        badgeReward: "Shop page draft + setup console",
        achievements: [
          achievement("owner.account_created", "Create account", "Role: shop owner"),
          achievement("owner.contact_verified", "Verify contact", "Verified email + phone protect the shop account"),
          achievement("owner.shop_identity_completed", "Shop identity", "Name, logo, address, description"),
          achievement("owner.shop_hours_set", "Set hours", "Daily hours + closures")
        ]
      },
      {
        index: 1,
        code: "SET 1",
        name: "Verified Shop",
        subtitle: "Legit, publicly",
        unlocks: "Opens: team invites",
        badgeName: "Verified Shop",
        badgeReward: "Search visibility + team invites",
        achievements: [
          achievement("owner.business_verified", "Business verification", "Documents → verified badge"),
          achievement("owner.stripe_connected", "Stripe connected", "Rent revenue lands here"),
          achievement("owner.policies_published", "Publish policies", "Real client-facing shop policies on the public profile"),
          achievement("owner.shop_profile_published", "Shop profile live", "Findable in search")
        ]
      },
      {
        index: 2,
        code: "SET 2",
        name: "The Team",
        subtitle: "Staff the floor",
        unlocks: "Opens: kiosk + floor tools",
        badgeName: "Full Roster",
        badgeReward: "Floor tools + rent agreements",
        achievements: [
          achievement("owner.first_barber_invited", "Invite first barber", "Terms attached — Full Booth Rent or AutoBooth Rent"),
          achievement("owner.first_barber_accepted", "First acceptance", "A chair is claimed"),
          achievement("owner.first_rent_agreement_signed", "Booth rent agreement signed", "The money doctrine, in writing"),
          achievement("owner.barber_permissions_set", "Permissions set", "Kiosk + walk-in eligibility per barber")
        ]
      },
      {
        index: 3,
        code: "SET 3",
        name: "The Floor",
        subtitle: "Operations live",
        unlocks: "Opens: Elite invite",
        badgeName: "Floor General",
        badgeReward: "Kiosk, rotation, TV & Floor Day",
        achievements: [
          achievement("owner.kiosk_paired", "Pair the kiosk", "Device + PIN + privacy"),
          achievement("owner.rotation_configured", "Configure rotation", "Fair-order walk-in routing"),
          achievement("owner.first_kiosk_walk_in", "First kiosk walk-in", "The front door works"),
          achievement("owner.first_floor_day", "Run a Floor Day", "The live command view"),
          achievement("owner.waiting_room_tv_activated", "Waiting room TV on", "The shop sells itself")
        ]
      },
      {
        index: 4,
        code: "SET 4",
        name: "Elite",
        subtitle: "Full subscription",
        unlocks: "The summit — every location, one view",
        badgeName: "Empire",
        badgeReward: "Multi-shop, report pack & AutoBooth",
        achievements: [
          achievement("owner.empire_activated", "Activate Empire", "Report pack + forecasting unlocked"),
          achievement("owner.barber_pools_seeded", "Seed your barbers’ pools", "Gift cuts across the floor — chairs stay full"),
          achievement("owner.autobooth_offered", "Offer AutoBooth", "Team rent on autopilot"),
          achievement("owner.first_zero_reconciliation", "First $0.00 reconciliation", "Both ledgers agree perfectly"),
          achievement("owner.second_location_added", "Add a second location", "The switcher earns its name")
        ]
      }
    ]
  }
} as const satisfies Record<RoadRole, RoadDefinition>;

export const ROAD_REFERRAL_LADDERS = {
  client_user: [
    { count: 1, reward: "Streak shield +1 — one missed week forgiven" },
    { count: 3, reward: "One month of V3 Member — platform-funded" },
    { count: 5, reward: "Gold flair + priority booking windows" }
  ],
  barber_user: [
    { count: 1, reward: "One month of V3 Pro — platform-funded" },
    { count: 3, reward: "Featured placement — one week in Search" },
    { count: 5, reward: "Founding Barber badge + 6 months of Pro" }
  ],
  shop_owner_user: [
    { count: 1, reward: "One month of Elite — platform-funded" },
    { count: 3, reward: "Featured shop — one week in Search" },
    { count: 5, reward: "Founding Shop badge + 6 months of Empire" }
  ]
} as const satisfies Record<RoadRole, readonly { count: number; reward: string }[]>;

export const ROAD_PUSH_PREVIEWS = {
  client_user: [
    { key: "set_1_complete", title: "SET 1 complete", body: "Fresh Fade earned — one-tap rebook is now yours.", rule: "Fires once when the last SET 1 achievement lands." },
    { key: "streak_at_risk", title: "Streak at risk", body: "Your cut streak ends Sunday. Check your barber’s openings.", rule: "Fires once per streak, three days before it breaks." },
    { key: "referral_counted", title: "Referral counted", body: "Your friend finished SET 1 — your platform-funded reward is ready.", rule: "Fires only when the referred account completes SET 1." },
    { key: "leaderboard_digest", title: "Friends moved", body: "Your friends-only road board changed this week.", rule: "Off by default; weekly digest at most." },
    { key: "summit_open", title: "The last door is open", body: "V3 Member is ready for you.", rule: "Fires once when SET 3 completes." }
  ],
  barber_user: [
    { key: "set_1_complete", title: "SET 1 complete", body: "Licensed & Verified — your profile now carries the badge clients trust.", rule: "Fires once when the last SET 1 achievement lands." },
    { key: "first_money", title: "First money", body: "First checkout done. The tip was 100% yours.", rule: "Fires once after the first completed checkout." },
    { key: "cut_milestone", title: "Cut milestone", body: "The Operator is one achievement away.", rule: "Fires at 10, 25, 50, and 100 completed native cuts." },
    { key: "referral_counted", title: "Referral counted", body: "A referred barber passed SET 1 — your platform-funded reward is ready.", rule: "Fires only when the referred account completes SET 1." },
    { key: "summit_open", title: "V3 Pro is open", body: "Analytics, growth engine & AutoBooth are waiting.", rule: "Fires once when SET 3 completes." }
  ],
  shop_owner_user: [
    { key: "shop_verified", title: "Shop verified", body: "The Verified Shop badge is live — you’re findable in Search.", rule: "Fires once when SET 1 completes." },
    { key: "first_kiosk_walk_in", title: "First kiosk walk-in", body: "The front door works. The Floor is moving.", rule: "Fires once from a completed native kiosk walk-in." },
    { key: "rent_reconciled", title: "Rent reconciled", body: "$0.00 across both ledgers — the week closed clean.", rule: "Fires weekly after exact ledger reconciliation." },
    { key: "referral_counted", title: "Referral counted", body: "A referred shop passed SET 1 — your platform-funded reward is ready.", rule: "Fires only when the referred account completes SET 1." },
    { key: "summit_open", title: "Elite is open", body: "Multi-shop, report pack & AutoBooth — the summit set is open.", rule: "Fires once when SET 3 completes." }
  ]
} as const satisfies Record<RoadRole, readonly { key: string; title: string; body: string; rule: string }[]>;

export function isRoadRole(value: unknown): value is RoadRole {
  return typeof value === "string" && ROAD_ROLES.includes(value as RoadRole);
}

export function getRoadDefinition(role: RoadRole): RoadDefinition {
  return ROAD_DEFINITIONS[role];
}

export function getRoadAchievement(role: RoadRole, achievementKey: string) {
  for (const set of ROAD_DEFINITIONS[role].sets) {
    const found = set.achievements.find((entry) => entry.key === achievementKey);
    if (found) {
      return { ...found, setIndex: set.index };
    }
  }
  return null;
}
