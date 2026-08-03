export const WAITING_ROOM_TIMELINE = [
  { id: "board", durationSeconds: 16 },
  { id: "menu", durationSeconds: 10 },
  { id: "schedule", durationSeconds: 12 },
  { id: "callout", durationSeconds: 6 },
  { id: "board", durationSeconds: 12 },
  { id: "availability", durationSeconds: 10 },
  { id: "culture", durationSeconds: 10 },
  { id: "reviews", durationSeconds: 12 },
  { id: "barber_of_week", durationSeconds: 10 },
  { id: "gifted", durationSeconds: 8 },
  { id: "milestone", durationSeconds: 8 },
  { id: "seasonal", durationSeconds: 8 },
  { id: "welcome", durationSeconds: 8 },
  { id: "hiring", durationSeconds: 8 },
  { id: "promo", durationSeconds: 10 }
] as const;

export type WaitingRoomSceneId = (typeof WAITING_ROOM_TIMELINE)[number]["id"];

export const WAITING_ROOM_SCENE_LABELS: Record<WaitingRoomSceneId, string> = {
  board: "Now serving",
  menu: "The menu",
  schedule: "Today",
  callout: "Chair ready",
  availability: "Open chairs",
  culture: "Culture",
  reviews: "Five stars",
  barber_of_week: "Barber of the week",
  gifted: "Gifted Cuts",
  milestone: "Team milestone",
  seasonal: "Seasonal week",
  welcome: "New chair",
  hiring: "Open chair",
  promo: "Your move"
};

export type WaitingRoomTeamRow = {
  barberId: string;
  name: string;
  floorState: "open" | "busy" | "offline";
  booked: number;
  completed: number;
  liveAppointments: number;
  nextAppointmentStart: string | null;
};

export type WaitingRoomMenuGroup = {
  barberId: string;
  barberName: string;
  services: Array<{ id: string; name: string; priceCents: number; durationMinutes: number }>;
};

export type WaitingRoomTvSnapshot = {
  shopId: string;
  shopName: string;
  generatedAt: string;
  team: WaitingRoomTeamRow[];
  menu: WaitingRoomMenuGroup[];
  status: "live" | "empty";
};

export function sceneAtElapsedSeconds(elapsedSeconds: number): WaitingRoomSceneId {
  const total = WAITING_ROOM_TIMELINE.reduce((sum, entry) => sum + entry.durationSeconds, 0);
  let remaining = Math.max(0, Math.floor(elapsedSeconds)) % total;

  for (const entry of WAITING_ROOM_TIMELINE) {
    if (remaining < entry.durationSeconds) return entry.id;
    remaining -= entry.durationSeconds;
  }

  return "board";
}

export function formatTvPrice(priceCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: priceCents % 100 === 0 ? 0 : 2
  }).format(priceCents / 100);
}
