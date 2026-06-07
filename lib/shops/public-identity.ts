export type PublicShopIdentityInput = {
  id?: string | null;
  name?: string | null;
  public_username?: string | null;
  publicUsername?: string | null;
  public_bio?: string | null;
  publicBio?: string | null;
  brand_line?: string | null;
  brandLine?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  zipCode?: string | null;
  profile_photo_path?: string | null;
  profile_photo_url?: string | null;
  profilePhotoUrl?: string | null;
  cover_photo_url?: string | null;
  coverPhotoUrl?: string | null;
  app_approval_status?: string | null;
  appApprovalStatus?: string | null;
};

function cleanText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanPublicLocationPart(value?: string | null) {
  const trimmed = cleanText(value);
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/[,\s-]/g, "");
  if (/^pending(?:pending)*$/i.test(normalized)) {
    return null;
  }

  return trimmed;
}

function formatApprovalLabel(status?: string | null) {
  const normalized = cleanText(status)?.toLowerCase();
  if (normalized === "approved") {
    return "Approved";
  }
  if (normalized === "pending") {
    return "Pending approval";
  }
  return normalized ? normalized.replaceAll("_", " ") : null;
}

export function formatPublicShopLocation(input: PublicShopIdentityInput) {
  const address = cleanPublicLocationPart(input.address);
  const city = cleanPublicLocationPart(input.city);
  const state = cleanPublicLocationPart(input.state);
  const zip = cleanPublicLocationPart(input.zip_code ?? input.zipCode);
  const cityState = [city, state].filter(Boolean).join(", ");
  const cityStateZip = [cityState, zip].filter(Boolean).join(" ");
  const normalizedAddress = address?.toLowerCase() ?? "";
  const addressAlreadyHasCityOrState = Boolean(address && [city, state].some((part) => part && normalizedAddress.includes(part.toLowerCase())));
  const addressAlreadyHasZip = Boolean(address && zip && normalizedAddress.includes(zip.toLowerCase()));

  if (address && addressAlreadyHasCityOrState) {
    return addressAlreadyHasZip || !zip ? address : `${address} ${zip}`;
  }

  if (address && cityStateZip) {
    return `${address} - ${cityStateZip}`;
  }

  if (address && cityState) {
    return `${address} - ${cityState}`;
  }

  return address ?? cityStateZip ?? cityState ?? "";
}

export function resolvePublicShopIdentity(input: PublicShopIdentityInput) {
  const publicUsername = cleanText(input.public_username ?? input.publicUsername);
  const displayName = cleanText(input.name) ?? "BVRB3R Shop";
  const approvalLabel = formatApprovalLabel(input.app_approval_status ?? input.appApprovalStatus);
  const avatarUrl = cleanText(input.profilePhotoUrl ?? input.profile_photo_url ?? input.profile_photo_path);

  return {
    shopId: cleanText(input.id),
    publicUsername,
    displayName,
    publicBio: cleanText(input.public_bio ?? input.publicBio),
    brandLine: cleanText(input.brand_line ?? input.brandLine),
    addressLine: cleanPublicLocationPart(input.address),
    city: cleanPublicLocationPart(input.city),
    state: cleanPublicLocationPart(input.state),
    zipCode: cleanPublicLocationPart(input.zip_code ?? input.zipCode),
    formattedPublicLocation: formatPublicShopLocation(input),
    avatarUrl,
    coverUrl: cleanText(input.coverPhotoUrl ?? input.cover_photo_url),
    approvalLabel,
    isVerified: (input.app_approval_status ?? input.appApprovalStatus)?.toLowerCase() === "approved"
  };
}
