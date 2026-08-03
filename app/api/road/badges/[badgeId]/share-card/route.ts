import { loadPublicRoadBadgeCard, RoadServiceError } from "@/lib/road/service.server";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ badgeId: string }> }
) {
  try {
    const { badgeId } = await params;
    const badge = await loadPublicRoadBadgeCard(badgeId);
    if (!badge) {
      return Response.json({ error: "Badge card not found." }, { status: 404 });
    }

    const accent = badge.legendary ? "#D9B461" : "#C4F24E";
    const handle = badge.username ? `@${badge.username}` : badge.displayName;
    const earnedLabel = Number.isNaN(new Date(badge.earnedAt).getTime())
      ? "Earned on The Road"
      : `Earned ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(badge.earnedAt))}`;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" role="img" aria-labelledby="title description">
        <title id="title">${escapeXml(badge.badgeName)} Road badge</title>
        <desc id="description">${escapeXml(badge.badgeReward)}</desc>
        <defs>
          <radialGradient id="halo" cx="50%" cy="30%" r="62%">
            <stop offset="0" stop-color="${accent}" stop-opacity=".24"/>
            <stop offset=".72" stop-color="${accent}" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#C4F24E"/>
            <stop offset="1" stop-color="#D9B461"/>
          </linearGradient>
        </defs>
        <rect width="1080" height="1350" rx="64" fill="#08090A"/>
        <rect x="28" y="28" width="1024" height="1294" rx="48" fill="none" stroke="${accent}" stroke-opacity=".48" stroke-width="2"/>
        <rect width="1080" height="1350" rx="64" fill="url(#halo)"/>
        <text x="540" y="138" text-anchor="middle" fill="${accent}" font-family="Space Mono, monospace" font-size="24" letter-spacing="8">BADGE EARNED · ${escapeXml(badge.setCode)}</text>
        <circle cx="540" cy="462" r="152" fill="${accent}" fill-opacity=".1" stroke="${accent}" stroke-width="5"/>
        <path d="M540 358l35 71 78 11-56 55 13 78-70-37-70 37 13-78-56-55 78-11 35-71z" fill="none" stroke="${accent}" stroke-width="9" stroke-linejoin="round"/>
        <text x="540" y="720" text-anchor="middle" fill="#F5F1E8" font-family="Instrument Serif, Georgia, serif" font-size="78">${escapeXml(badge.badgeName)}</text>
        <text x="540" y="790" text-anchor="middle" fill="#F5F1E8" fill-opacity=".58" font-family="Archivo, Arial, sans-serif" font-size="28">${escapeXml(badge.badgeReward)}</text>
        <rect x="180" y="852" width="720" height="4" rx="2" fill="url(#line)"/>
        <text x="540" y="942" text-anchor="middle" fill="#F5F1E8" fill-opacity=".72" font-family="Space Mono, monospace" font-size="24">${escapeXml(handle)} · ${escapeXml(badge.roadTitle)}</text>
        <text x="540" y="1000" text-anchor="middle" fill="#F5F1E8" fill-opacity=".42" font-family="Space Mono, monospace" font-size="20">${escapeXml(earnedLabel)}</text>
        <text x="540" y="1190" text-anchor="middle" fill="#F5F1E8" font-family="Archivo, Arial, sans-serif" font-size="34" font-weight="800" letter-spacing="10">BVRB3R</text>
        <circle cx="633" cy="1179" r="9" fill="#C4F24E"/>
      </svg>
    `.trim();

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Disposition": `inline; filename="bvrb3r-road-${badge.badgeId}.svg"`,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const status = error instanceof RoadServiceError ? error.status : 500;
    return Response.json({ error: status === 400 ? "Invalid badge." : "Badge card unavailable." }, { status });
  }
}
