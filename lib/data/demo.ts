import {
  Appointment,
  AuditLogItem,
  Barber,
  BoothRentLedgerEntry,
  Client,
  InventoryItem,
  KpiMetric,
  Location,
  NotificationItem,
  PermissionGroup,
  Review,
  RevenuePoint,
  Service,
  TaskItem,
  UserAccount,
  WaitlistEntry,
  WalkInEntry
} from "@/types/domain";

export const demoLocations: Location[] = [
  {
    id: "loc-ybor",
    name: "Centro Ybor Flagship",
    neighborhood: "Ybor City",
    city: "Tampa",
    state: "FL",
    phone: "(813) 555-0101",
    hours: "Mon-Sat 9a-8p, Sun 11a-5p",
    chairs: 10,
    taxRate: 0.075
  },
  {
    id: "loc-hyde",
    name: "Hyde Park Studio",
    neighborhood: "Hyde Park",
    city: "Tampa",
    state: "FL",
    phone: "(813) 555-0121",
    hours: "Mon-Sat 10a-7p, Sun 11a-4p",
    chairs: 6,
    taxRate: 0.075
  }
];

export const demoServices: Service[] = [
  { id: "srv-signature", category: "Haircuts", name: "Signature Precision Cut", description: "Tailored fade, shear finish, hot towel detail.", durationMin: 60, bufferMin: 10, price: 55, deposit: 15, fullPrepay: false, addOnIds: ["srv-beard", "srv-enhancement"] },
  { id: "srv-premium", category: "Haircuts", name: "Premium Cut + Beard Sculpt", description: "Sharp blend with full beard design and lineup.", durationMin: 75, bufferMin: 10, price: 78, deposit: 20, fullPrepay: false, addOnIds: ["srv-blackmask", "srv-razor"] },
  { id: "srv-kids", category: "Haircuts", name: "Future Star Kids Cut", description: "Ages 6-12 with clean lineup finish.", durationMin: 40, bufferMin: 5, price: 32, deposit: 10, fullPrepay: false, addOnIds: [] },
  { id: "srv-razor", category: "Shaves", name: "Executive Razor Shave", description: "Steam prep, hot towel, premium razor finish.", durationMin: 45, bufferMin: 10, price: 42, deposit: 10, fullPrepay: false, addOnIds: ["srv-blackmask"] },
  { id: "srv-beard", category: "Add-ons", name: "Beard Sculpt", description: "Detailed shape-up and conditioning treatment.", durationMin: 20, bufferMin: 5, price: 18, deposit: 0, fullPrepay: false, addOnIds: [] },
  { id: "srv-enhancement", category: "Add-ons", name: "Enhancement Finish", description: "Subtle enhancement for line definition.", durationMin: 15, bufferMin: 0, price: 15, deposit: 0, fullPrepay: false, addOnIds: [] },
  { id: "srv-blackmask", category: "Treatments", name: "Black Mask Detox", description: "Pore cleanse and skin reset treatment.", durationMin: 15, bufferMin: 0, price: 12, deposit: 0, fullPrepay: false, addOnIds: [] },
  { id: "srv-color", category: "Color", name: "Grey Blend Camouflage", description: "Quick natural blend for beard or hairline.", durationMin: 35, bufferMin: 10, price: 48, deposit: 15, fullPrepay: true, addOnIds: [] },
  { id: "srv-design", category: "Design", name: "Texture + Design Session", description: "Freestyle part, texture styling, or design detail.", durationMin: 50, bufferMin: 10, price: 52, deposit: 15, fullPrepay: false, addOnIds: ["srv-enhancement"] },
  { id: "srv-membership", category: "Membership", name: "VIP Monthly Refresh", description: "Reserved cadence slot with premium styling.", durationMin: 45, bufferMin: 10, price: 65, deposit: 0, fullPrepay: false, addOnIds: ["srv-beard"] }
];

export const demoUsers: UserAccount[] = [
  { id: "user-architect", role: "platform_admin", email: "architect@bvrb3r.demo", password: "DevOnly!123", name: "Avery Stone", title: "Founder / Platform Admin", locationIds: ["loc-ybor", "loc-hyde"], primaryOnboardingRole: "platform_admin", platformAdmin: true },
  { id: "user-owner", role: "owner", email: "owner@bvrb3r.demo", password: "DevOnly!123", name: "Brandon Rivers", title: "Shop Owner", locationIds: ["loc-ybor", "loc-hyde"] },
  { id: "user-manager", role: "manager", email: "manager@bvrb3r.demo", password: "DevOnly!123", name: "Mia Torres", title: "Shop Manager", locationIds: ["loc-ybor"] },
  { id: "user-frontdesk", role: "front_desk", email: "frontdesk@bvrb3r.demo", password: "DevOnly!123", name: "Kayla Brooks", title: "Front Desk / Kiosk Ops", locationIds: ["loc-ybor"] },
  { id: "user-wave", role: "manager", email: "wave@bvrb3r.demo", password: "DevOnly!123", name: "Wave Carter", title: "Barber Manager", locationIds: ["loc-ybor"], barberId: "barber-wave" },
  { id: "user-fade", role: "commission_barber", email: "fade@bvrb3r.demo", password: "DevOnly!123", name: "Fade Monroe", title: "Commission Barber", locationIds: ["loc-hyde"], barberId: "barber-fade" },
  { id: "user-blaze", role: "booth_rent_barber", email: "blaze@bvrb3r.demo", password: "DevOnly!123", name: "Blaze King", title: "Booth-Rent Barber", locationIds: ["loc-ybor"], barberId: "barber-blaze" },
  { id: "user-luxe", role: "booth_rent_barber", email: "lux@bvrb3r.demo", password: "DevOnly!123", name: "Luxe Reed", title: "Freelance Barber", locationIds: ["loc-hyde"], barberId: "barber-luxe" },
  { id: "user-client", role: "client", email: "client@bvrb3r.demo", password: "DevOnly!123", name: "Jordan Ellis", title: "Client", locationIds: ["loc-ybor"], clientId: "client-jordan" }
];

export const demoBarbers: Barber[] = [
  {
    id: "barber-wave",
    userId: "user-wave",
    name: "Wave Carter",
    role: "commission_barber",
    locationIds: ["loc-ybor"],
    specialties: ["precision fades", "beard architecture", "VIP clients"],
    rating: 4.9,
    reviewCount: 182,
    compensationModel: "commission",
    commissionRate: 0.48,
    todayEarnings: 420,
    upcomingPayout: 1280,
    availabilityLabel: "Today 10:00 AM - 7:00 PM",
    bio: "Known for clean blends and polished guest experience.",
    bookingLink: "bvrb3r.com/wave"
  },
  {
    id: "barber-fade",
    userId: "user-fade",
    name: "Fade Monroe",
    role: "commission_barber",
    locationIds: ["loc-hyde"],
    specialties: ["texture work", "design lines", "kids cuts"],
    rating: 4.8,
    reviewCount: 126,
    compensationModel: "commission",
    commissionRate: 0.44,
    todayEarnings: 305,
    upcomingPayout: 980,
    availabilityLabel: "Today 11:00 AM - 6:00 PM",
    bio: "Creative specialist with fast chair turnover and strong retail attach.",
    bookingLink: "bvrb3r.com/fade"
  },
  {
    id: "barber-blaze",
    userId: "user-blaze",
    name: "Blaze King",
    role: "booth_rent_barber",
    locationIds: ["loc-ybor"],
    specialties: ["executive grooming", "razor detail", "mobile clients"],
    rating: 5,
    reviewCount: 94,
    compensationModel: "booth_rent",
    boothRentAmount: 325,
    boothRentFrequency: "weekly",
    todayEarnings: 510,
    upcomingPayout: 0,
    availabilityLabel: "Today 9:00 AM - 6:00 PM",
    bio: "Independent operator with a loyal executive clientele.",
    bookingLink: "bvrb3r.com/blaze"
  },
  {
    id: "barber-luxe",
    userId: "user-luxe",
    name: "Luxe Reed",
    role: "booth_rent_barber",
    locationIds: ["loc-hyde"],
    specialties: ["premium finish", "color work", "camera-ready cuts"],
    rating: 4.9,
    reviewCount: 88,
    compensationModel: "booth_rent",
    boothRentAmount: 1250,
    boothRentFrequency: "monthly",
    todayEarnings: 440,
    upcomingPayout: 0,
    availabilityLabel: "Today 10:00 AM - 5:00 PM",
    bio: "Luxury-focused barber serving high-frequency professionals.",
    bookingLink: "bvrb3r.com/luxe"
  }
];

export const demoClients: Client[] = [
  { id: "client-jordan", name: "Jordan Ellis", phone: "(813) 555-0190", email: "client@bvrb3r.demo", favoriteBarberId: "barber-wave", loyaltyPoints: 220, retentionTag: "vip", notes: ["Prefers low taper", "Likes text reminders"] },
  { id: "client-nova", name: "Nova Bennett", phone: "(813) 555-0191", email: "nova@example.com", favoriteBarberId: "barber-blaze", loyaltyPoints: 44, retentionTag: "repeat", notes: ["Books every other Friday"] },
  { id: "client-rome", name: "Rome Jackson", phone: "(813) 555-0192", email: "rome@example.com", favoriteBarberId: "barber-wave", loyaltyPoints: 12, retentionTag: "new", notes: ["Requested beard oil recommendation"] },
  { id: "client-ava", name: "Ava Rivera", phone: "(813) 555-0193", email: "ava@example.com", favoriteBarberId: "barber-luxe", loyaltyPoints: 75, retentionTag: "repeat", notes: ["Usually books color camouflage"] },
  { id: "client-malik", name: "Malik Grant", phone: "(813) 555-0194", email: "malik@example.com", favoriteBarberId: "barber-fade", loyaltyPoints: 34, retentionTag: "repeat", notes: ["Prefers Saturdays"] },
  { id: "client-sage", name: "Sage Franklin", phone: "(813) 555-0195", email: "sage@example.com", favoriteBarberId: "barber-fade", loyaltyPoints: 18, retentionTag: "new", notes: ["Requested design consultation"] },
  { id: "client-cam", name: "Cam Holloway", phone: "(813) 555-0196", email: "cam@example.com", favoriteBarberId: "barber-wave", loyaltyPoints: 0, retentionTag: "lapsed", notes: ["Last visit 74 days ago"] },
  { id: "client-zoe", name: "Zoe Harris", phone: "(813) 555-0197", email: "zoe@example.com", favoriteBarberId: "barber-luxe", loyaltyPoints: 120, retentionTag: "vip", notes: ["Wants receipt by email"] },
  { id: "client-omar", name: "Omar Pierce", phone: "(813) 555-0198", email: "omar@example.com", favoriteBarberId: "barber-blaze", loyaltyPoints: 64, retentionTag: "repeat", notes: ["Books for event prep"] },
  { id: "client-lyric", name: "Lyric Mason", phone: "(813) 555-0199", email: "lyric@example.com", favoriteBarberId: "barber-wave", loyaltyPoints: 55, retentionTag: "repeat", notes: ["No-show warning on file"] },
  { id: "client-noah", name: "Noah Quinn", phone: "(813) 555-0200", email: "noah@example.com", favoriteBarberId: "barber-blaze", loyaltyPoints: 16, retentionTag: "new", notes: ["First responder discount approved"] },
  { id: "client-kai", name: "Kai Summers", phone: "(813) 555-0201", email: "kai@example.com", favoriteBarberId: "barber-fade", loyaltyPoints: 26, retentionTag: "repeat", notes: ["Sensitive skin for razor services"] }
];

export const demoAppointments: Appointment[] = [
  { id: "appt-1", locationId: "loc-ybor", barberId: "barber-wave", clientId: "client-jordan", serviceId: "srv-signature", status: "booked", start: "2026-03-08T10:00:00-05:00", end: "2026-03-08T11:10:00-05:00", chair: "Chair 2", addOnIds: ["srv-beard"], depositAmount: 15, totalAmount: 73, balanceDue: 58, tipAmount: 0, note: "Wedding prep cut.", source: "booking" },
  { id: "appt-2", locationId: "loc-ybor", barberId: "barber-wave", clientId: "client-rome", serviceId: "srv-premium", status: "checked_in", start: "2026-03-08T11:30:00-05:00", end: "2026-03-08T12:55:00-05:00", chair: "Chair 2", addOnIds: ["srv-blackmask"], depositAmount: 20, totalAmount: 90, balanceDue: 70, tipAmount: 0, note: "Discuss membership.", source: "front_desk" },
  { id: "appt-3", locationId: "loc-ybor", barberId: "barber-blaze", clientId: "client-nova", serviceId: "srv-razor", status: "in_service", start: "2026-03-08T12:00:00-05:00", end: "2026-03-08T12:55:00-05:00", chair: "Chair 6", addOnIds: ["srv-blackmask"], depositAmount: 10, totalAmount: 54, balanceDue: 44, tipAmount: 0, note: "Client on lunch break.", source: "booking" },
  { id: "appt-4", locationId: "loc-ybor", barberId: "barber-blaze", clientId: "client-omar", serviceId: "srv-signature", status: "completed", start: "2026-03-08T08:30:00-05:00", end: "2026-03-08T09:40:00-05:00", chair: "Chair 6", addOnIds: ["srv-enhancement"], depositAmount: 15, totalAmount: 70, balanceDue: 0, tipAmount: 15, note: "Requested rebook in 2 weeks.", source: "booking" },
  { id: "appt-5", locationId: "loc-hyde", barberId: "barber-fade", clientId: "client-malik", serviceId: "srv-design", status: "booked", start: "2026-03-08T13:00:00-05:00", end: "2026-03-08T14:00:00-05:00", chair: "Chair 3", addOnIds: ["srv-enhancement"], depositAmount: 15, totalAmount: 67, balanceDue: 52, tipAmount: 0, note: "Game day look.", source: "booking" },
  { id: "appt-6", locationId: "loc-hyde", barberId: "barber-luxe", clientId: "client-ava", serviceId: "srv-color", status: "booked", start: "2026-03-08T15:00:00-05:00", end: "2026-03-08T15:45:00-05:00", chair: "Chair 1", addOnIds: [], depositAmount: 48, totalAmount: 48, balanceDue: 0, tipAmount: 0, note: "Fully prepaid service.", source: "booking" },
  { id: "appt-7", locationId: "loc-hyde", barberId: "barber-luxe", clientId: "client-zoe", serviceId: "srv-membership", status: "completed", start: "2026-03-07T16:00:00-05:00", end: "2026-03-07T16:55:00-05:00", chair: "Chair 1", addOnIds: ["srv-beard"], depositAmount: 0, totalAmount: 83, balanceDue: 0, tipAmount: 18, note: "Send review request.", source: "booking" },
  { id: "appt-8", locationId: "loc-ybor", barberId: "barber-wave", clientId: "client-lyric", serviceId: "srv-kids", status: "no_show", start: "2026-03-07T18:00:00-05:00", end: "2026-03-07T18:45:00-05:00", chair: "Chair 2", addOnIds: [], depositAmount: 10, totalAmount: 32, balanceDue: 22, tipAmount: 0, note: "Deposit retained under policy.", source: "booking" }
];

export const demoWaitlist: WaitlistEntry[] = [
  { id: "wait-1", locationId: "loc-ybor", clientId: "client-cam", serviceId: "srv-signature", requestedDate: "2026-03-09", preferredWindow: "After 5 PM", barberPreference: "barber-wave" },
  { id: "wait-2", locationId: "loc-hyde", clientId: "client-kai", serviceId: "srv-razor", requestedDate: "2026-03-10", preferredWindow: "Morning" }
];

export const demoWalkIns: WalkInEntry[] = [
  { id: "walk-1", locationId: "loc-ybor", clientName: "Tre Benton", requestedService: "Signature Precision Cut", requestedAt: "2026-03-08T10:35:00-05:00", status: "waiting", waitMinutes: 18 },
  { id: "walk-2", locationId: "loc-ybor", clientName: "Imani Cross", requestedService: "Executive Razor Shave", requestedAt: "2026-03-08T10:20:00-05:00", status: "assigned", assignedBarberId: "barber-blaze", waitMinutes: 9 },
  { id: "walk-3", locationId: "loc-hyde", clientName: "Jules Price", requestedService: "Future Star Kids Cut", requestedAt: "2026-03-08T11:10:00-05:00", status: "waiting", waitMinutes: 12 }
];

export const boothRentLedger: BoothRentLedgerEntry[] = [
  { id: "rent-1", barberId: "barber-blaze", periodLabel: "Week of Mar 3", dueDate: "2026-03-05", amount: 325, status: "paid", paidDate: "2026-03-04" },
  { id: "rent-2", barberId: "barber-blaze", periodLabel: "Week of Mar 10", dueDate: "2026-03-12", amount: 325, status: "due" },
  { id: "rent-3", barberId: "barber-luxe", periodLabel: "March 2026", dueDate: "2026-03-01", amount: 1250, status: "overdue" },
  { id: "rent-4", barberId: "barber-luxe", periodLabel: "February 2026", dueDate: "2026-02-01", amount: 1250, status: "paid", paidDate: "2026-02-02" }
];

export const demoReviews: Review[] = [
  { id: "review-1", barberId: "barber-wave", clientId: "client-jordan", locationId: "loc-ybor", rating: 5, sentiment: "great", message: "Sharpest cut in Ybor. Fast and premium every time.", createdAt: "2026-03-06" },
  { id: "review-2", barberId: "barber-blaze", clientId: "client-nova", locationId: "loc-ybor", rating: 5, sentiment: "great", message: "Great shave and amazing hospitality.", createdAt: "2026-03-05" },
  { id: "review-3", barberId: "barber-fade", clientId: "client-malik", locationId: "loc-hyde", rating: 4, sentiment: "good", message: "Creative design work and super clean finish.", createdAt: "2026-03-02" },
  { id: "review-4", barberId: "barber-luxe", clientId: "client-zoe", locationId: "loc-hyde", rating: 3, sentiment: "watch", message: "Loved the service but wanted a quicker confirmation text.", createdAt: "2026-03-01" }
];

export const demoTasks: TaskItem[] = [
  { id: "task-1", locationId: "loc-ybor", title: "Approve 10% first responder discount for Noah", assignee: "Mia Torres", status: "open", priority: "medium" },
  { id: "task-2", locationId: "loc-ybor", title: "Restock premium shave gel", assignee: "Kayla Brooks", status: "in_progress", priority: "high" },
  { id: "task-3", locationId: "loc-hyde", title: "Review late arrival policy signage", assignee: "Luxe Reed", status: "done", priority: "low" }
];

export const inventoryItems: InventoryItem[] = [
  { id: "inv-1", locationId: "loc-ybor", name: "BVRB3R Matte Clay", stock: 11, reorderAt: 8 },
  { id: "inv-2", locationId: "loc-ybor", name: "Premium Shave Gel", stock: 4, reorderAt: 6 },
  { id: "inv-3", locationId: "loc-hyde", name: "Beard Oil", stock: 14, reorderAt: 5 }
];

export const notifications: NotificationItem[] = [
  { id: "note-1", audience: "client", title: "Review request placeholder", body: "Automatically send 2 hours after completed appointment.", channel: "sms", scheduledFor: "2026-03-08T19:00:00-05:00", status: "placeholder" },
  { id: "note-2", audience: "all_staff", title: "Saturday demand alert", body: "Front desk should activate overflow walk-in protocol at 2 PM.", channel: "in_app", scheduledFor: "2026-03-08T13:00:00-05:00", status: "scheduled" },
  { id: "note-3", audience: "client", title: "Birthday campaign placeholder", body: "Offer 15% beard sculpt add-on during birthday month.", channel: "email", scheduledFor: "2026-03-15T09:00:00-05:00", status: "placeholder" }
];

export const auditLogs: AuditLogItem[] = [
  { id: "audit-1", actor: "Brandon Rivers", action: "Updated commission rule", target: "Ybor commission profile", createdAt: "2026-03-06T09:12:00-05:00", severity: "critical" },
  { id: "audit-2", actor: "Mia Torres", action: "Approved schedule swap", target: "Wave Carter / Blaze King", createdAt: "2026-03-07T17:20:00-05:00", severity: "info" },
  { id: "audit-3", actor: "Kayla Brooks", action: "Retained no-show deposit", target: "Lyric Mason", createdAt: "2026-03-07T18:18:00-05:00", severity: "warning" }
];

export const ownerKpis: KpiMetric[] = [
  { label: "Revenue today", value: "$6.8K", delta: "+12% vs last Sunday" },
  { label: "Utilization", value: "84%", delta: "+7 pts" },
  { label: "No-show rate", value: "3.1%", delta: "-1.2 pts" },
  { label: "Repeat bookings", value: "61%", delta: "+4 pts" }
];

export const managerKpis: KpiMetric[] = [
  { label: "Check-ins complete", value: "22 / 28", delta: "6 upcoming" },
  { label: "Queue wait avg", value: "13 min", delta: "Within target" },
  { label: "Retail attach", value: "21%", delta: "+3 pts" },
  { label: "Review score", value: "4.8", delta: "1 follow-up needed" }
];

export const revenueSeries: RevenuePoint[] = [
  { label: "Mon", revenue: 4100, appointments: 48 },
  { label: "Tue", revenue: 4450, appointments: 52 },
  { label: "Wed", revenue: 4680, appointments: 55 },
  { label: "Thu", revenue: 5200, appointments: 60 },
  { label: "Fri", revenue: 6100, appointments: 69 },
  { label: "Sat", revenue: 7400, appointments: 82 },
  { label: "Sun", revenue: 6800, appointments: 58 }
];

export const permissionMatrix: PermissionGroup[] = [
  { role: "owner", allows: ["Manage locations", "Set commission and booth-rent rules", "Control shop service catalog", "View all analytics", "Manage billing and permissions"], restricted: [] },
  { role: "manager", allows: ["Run daily operations", "Adjust appointments", "Approve limited discounts", "View location reports"], restricted: ["Cannot edit ownership financial structures", "Cannot change global billing", "Cannot edit owner-controlled commission service pricing"] },
  { role: "front_desk", allows: ["Create and edit appointments", "Manage walk-ins", "Collect payments", "View client history"], restricted: ["Cannot access payroll or global analytics"] },
  { role: "commission_barber", allows: ["Manage own schedule", "See own earnings", "View shop-defined services", "Update personal notes"], restricted: ["Cannot view team financials", "Cannot edit service pricing or service definitions"] },
  { role: "booth_rent_barber", allows: ["Manage own bookings", "View rent ledger", "Update availability", "Manage self-owned services"], restricted: ["Cannot access owner reports", "Cannot edit shop-owned commission services"] },
  { role: "client", allows: ["Book and rebook", "Manage profile", "Join waitlist", "View history"], restricted: ["Cannot access internal operations"] }
];
