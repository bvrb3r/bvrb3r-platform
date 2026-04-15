const KNOWN_AUTH_COOKIE_NAMES = new Set([
  "bvrb3r-demo-email",
  "supabase.auth.token",
  "supabase-auth-token"
]);

function normalizeName(name: string) {
  return name.trim();
}

export function isSessionIsolationCookieName(name: string) {
  const normalized = normalizeName(name);
  return normalized.startsWith("sb-") || normalized.startsWith("bvrb3r-") || KNOWN_AUTH_COOKIE_NAMES.has(normalized);
}

export function isSessionIsolationStorageKey(key: string) {
  const normalized = normalizeName(key);
  const lower = normalized.toLowerCase();
  return (
    lower.startsWith("sb-") ||
    lower.startsWith("bvrb3r-") ||
    lower.includes("supabase") ||
    lower.includes("auth-token") ||
    lower.includes("react-query") ||
    lower.includes("tanstack")
  );
}

function storageKeys(storage: Storage) {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => Boolean(key));
}

function expireBrowserCookie(name: string) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const encodedName = encodeURIComponent(name);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const base = `${encodedName}=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax${secure}`;
  document.cookie = base;

  const hostname = window.location.hostname;
  if (!hostname || hostname === "localhost") {
    return;
  }

  document.cookie = `${base}; domain=${hostname}`;
  if (hostname.startsWith("www.")) {
    document.cookie = `${base}; domain=.${hostname.slice(4)}`;
  }
}

export function clearBrowserAccountState() {
  if (typeof window === "undefined") {
    return {
      localStorageKeys: [] as string[],
      sessionStorageKeys: [] as string[],
      cookieNames: [] as string[]
    };
  }

  const localStorageKeys = (() => {
    try {
      const keys = storageKeys(window.localStorage).filter(isSessionIsolationStorageKey);
      keys.forEach((key) => window.localStorage.removeItem(key));
      return keys;
    } catch {
      return [];
    }
  })();

  const sessionStorageKeys = (() => {
    try {
      const keys = storageKeys(window.sessionStorage);
      keys.forEach((key) => window.sessionStorage.removeItem(key));
      return keys;
    } catch {
      return [];
    }
  })();

  const cookieNames = (() => {
    try {
      const names = document.cookie
        .split(";")
        .map((cookie) => cookie.split("=")[0]?.trim() ?? "")
        .filter((name) => name && isSessionIsolationCookieName(name));
      names.forEach(expireBrowserCookie);
      return names;
    } catch {
      return [];
    }
  })();

  return {
    localStorageKeys,
    sessionStorageKeys,
    cookieNames
  };
}
