export const KIOSK_DEVICE_COOKIE = "bvrb3r-kiosk-device";
export const KIOSK_DEVICE_COOKIE_MAX_AGE = 60 * 60 * 12;

export function parseKioskDeviceCookieValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const decoded = decodeURIComponent(value).trim();
  return decoded ? decoded : null;
}

export function serializeKioskDeviceCookieValue(shopId: string) {
  return encodeURIComponent(shopId.trim());
}
