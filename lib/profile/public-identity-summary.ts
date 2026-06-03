type PublicLocationParts = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  shopName?: string | null;
};

function cleanPublicPart(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed || /^pending$/i.test(trimmed)) {
    return "";
  }

  return trimmed;
}

export function formatPublicCityStateLocation({
  city,
  state,
  fallback = "Add public location"
}: {
  city?: string | null;
  state?: string | null;
  fallback?: string;
}) {
  const cleanCity = cleanPublicPart(city);
  const cleanState = cleanPublicPart(state);
  return [cleanCity, cleanState].filter(Boolean).join(", ") || fallback;
}

export function formatPublicAddressLocation({
  address,
  city,
  state,
  zip,
  shopName,
  fallback = "Add service location"
}: PublicLocationParts & {
  fallback?: string;
}) {
  const cleanAddress = cleanPublicPart(address);
  const cleanCity = cleanPublicPart(city);
  const cleanState = cleanPublicPart(state);
  const cleanZip = cleanPublicPart(zip);
  const cleanShopName = cleanPublicPart(shopName);
  const cityState = [cleanCity, cleanState].filter(Boolean).join(", ");
  const cityStateZip = [cityState, cleanZip].filter(Boolean).join(" ");

  return [cleanShopName, cleanAddress, cityStateZip].filter(Boolean).join(" - ") || fallback;
}

export function formatPublicUsernameLine(username?: string | null) {
  const cleanUsername = cleanPublicPart(username)?.replace(/^@+/, "");
  return cleanUsername ? `@${cleanUsername}` : "Add public username";
}
