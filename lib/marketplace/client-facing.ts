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

function isInternalPublicReference(value: string) {
  return /^(barber|client|independent-barber|srv)-/i.test(value);
}

function cleanDisplayName(value?: string | null) {
  const cleaned = clean(value);
  return cleaned && !isInternalPublicReference(cleaned) ? cleaned : "";
}

export function normalizePublicBarberHandle(value?: string | null) {
  return clean(value).replace(/^@+/, "");
}

export function getClientFacingBarberName(barber: ClientFacingBarberIdentity) {
  const publicUsername = normalizePublicBarberHandle(barber.publicUsername);
  const username = normalizePublicBarberHandle(barber.username);
  const handle = normalizePublicBarberHandle(barber.handle);

  return (publicUsername && !isInternalPublicReference(publicUsername) ? publicUsername : "")
    || (username && !isInternalPublicReference(username) ? username : "")
    || (handle && !isInternalPublicReference(handle) ? handle : "")
    || cleanDisplayName(barber.publicDisplayName)
    || cleanDisplayName(barber.displayName)
    || cleanDisplayName(barber.businessName)
    || cleanDisplayName(barber.stageName)
    || cleanDisplayName(barber.barberName)
    || cleanDisplayName(barber.name)
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
