type ClientFacingBarberIdentity = {
  publicUsername?: string | null;
  username?: string | null;
  handle?: string | null;
  publicDisplayName?: string | null;
  displayName?: string | null;
  businessName?: string | null;
  stageName?: string | null;
  barberName?: string | null;
  name?: string | null;
};

type BookingLocationInput = {
  name?: string | null;
  address?: string | null;
  addressLine2?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  postal_code?: string | null;
  neighborhood?: string | null;
};

function clean(value?: string | null) {
  return value?.trim() || "";
}

export function normalizePublicBarberHandle(value?: string | null) {
  return clean(value).replace(/^@+/, "");
}

export function getClientFacingBarberName(barber: ClientFacingBarberIdentity) {
  return normalizePublicBarberHandle(barber.publicUsername)
    || normalizePublicBarberHandle(barber.username)
    || normalizePublicBarberHandle(barber.handle)
    || clean(barber.publicDisplayName)
    || clean(barber.displayName)
    || clean(barber.businessName)
    || clean(barber.stageName)
    || clean(barber.barberName)
    || clean(barber.name)
    || "BVRB3R barber";
}

function looksLikeStreetAddress(value: string) {
  return /\d/.test(value)
    || /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|mall|plaza|way|ct|court|suite|ste)\b/i.test(value);
}

function cityStateZip(location: BookingLocationInput) {
  const city = clean(location.city);
  const state = clean(location.state);
  const postalCode = clean(location.postalCode ?? location.postal_code);
  const cityState = [city, state].filter(Boolean).join(", ");
  return [cityState, postalCode].filter(Boolean).join(" ");
}

export function getBookingLocationLines(location?: BookingLocationInput | null) {
  if (!location) {
    return ["Service location"];
  }

  const name = clean(location.name) || "Service location";
  const neighborhood = clean(location.neighborhood);
  const street = clean(location.address) || (looksLikeStreetAddress(neighborhood) ? neighborhood : "");
  const line2 = clean(location.addressLine2 ?? location.address_line_2);
  const area = cityStateZip(location) || (!street && neighborhood && neighborhood !== name ? neighborhood : "");
  const lines = [name, street, line2, area]
    .filter((line, index, values) => Boolean(line) && values.indexOf(line) === index);

  return lines.length ? lines : ["Service location"];
}

export function getBookingLocationSummary(location?: BookingLocationInput | null) {
  return getBookingLocationLines(location).join(", ");
}
