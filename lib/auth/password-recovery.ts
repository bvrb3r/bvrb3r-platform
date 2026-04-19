export const PASSWORD_RESET_REDIRECT_TO = "https://bvrb3r.app/reset-password";
export const PASSWORD_RESET_GENERIC_SUCCESS = "If an account exists for that information, reset instructions have been sent.";
export const PASSWORD_RESET_GENERIC_FAILURE = "We couldn't process that request right now. Please try again.";
export const PASSWORD_RESET_INVALID_LINK = "This reset link is invalid or expired. Please request a new one.";

export type PasswordRecoveryIdentifierKind = "email" | "phone" | "username" | "empty";

type QueryResult = {
  data?: unknown;
  error?: unknown;
};

export type PasswordRecoveryQueryBuilder = {
  eq: (column: string, value: unknown) => PasswordRecoveryQueryBuilder;
  limit: (count: number) => PasswordRecoveryQueryBuilder;
  maybeSingle: () => PromiseLike<QueryResult>;
};

export type PasswordRecoverySelectableQuery = {
  select: (columns: string) => PasswordRecoveryQueryBuilder;
};

export type PasswordRecoveryLookupClient = {
  from: (table: string) => PasswordRecoverySelectableQuery;
};

export type PasswordRecoverySupabaseClient = PasswordRecoveryLookupClient & {
  auth: {
    resetPasswordForEmail: (
      email: string,
      options: { redirectTo: string }
    ) => Promise<{ error: unknown | null }>;
  };
};

export type ResolvedPasswordRecoveryEmail = {
  email: string;
  source: "identifier_email" | "profiles" | "client_profiles" | "barber_profiles" | "barbers";
  profileId?: string | null;
};

type SupabaseErrorShape = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  status?: number;
};

function getErrorShape(error: unknown): SupabaseErrorShape {
  return error && typeof error === "object" ? error as SupabaseErrorShape : {};
}

export function describePasswordRecoveryError(error: unknown) {
  if (!error || typeof error !== "object") {
    return `${error ?? "unknown error"}`;
  }

  const candidate = getErrorShape(error);
  return [
    candidate.message,
    candidate.status ? `status=${candidate.status}` : null,
    candidate.code ? `code=${candidate.code}` : null,
    candidate.details ? `details=${candidate.details}` : null,
    candidate.hint ? `hint=${candidate.hint}` : null
  ].filter(Boolean).join(" | ") || "unknown Supabase error";
}

function isSchemaLookupError(error: unknown) {
  const candidate = getErrorShape(error);
  const message = `${candidate.message ?? ""}`.toLowerCase();
  return candidate.code === "42P01"
    || candidate.code === "42703"
    || candidate.code === "PGRST204"
    || candidate.code === "PGRST205"
    || message.includes("does not exist")
    || message.includes("could not find the table")
    || message.includes("could not find the column");
}

export function shouldMaskPasswordResetError(error: unknown) {
  const status = getErrorShape(error).status;
  return typeof status === "number" && status >= 400 && status < 500;
}

export function normalizeRecoveryIdentifier(identifier?: string | null) {
  return `${identifier ?? ""}`.trim();
}

export function normalizeEmail(email?: string | null) {
  return normalizeRecoveryIdentifier(email).toLowerCase();
}

export function isEmail(identifier?: string | null) {
  const normalized = normalizeEmail(identifier);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function getPhoneDigits(identifier?: string | null) {
  return normalizeRecoveryIdentifier(identifier).replace(/\D+/g, "");
}

export function normalizePhone(phone?: string | null) {
  const raw = normalizeRecoveryIdentifier(phone);
  const digits = getPhoneDigits(raw);
  if (digits.length < 7) {
    return "";
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return raw.startsWith("+") ? `+${digits}` : `+${digits}`;
}

export function isPhone(identifier?: string | null) {
  return Boolean(normalizePhone(identifier));
}

function normalizeUsername(username?: string | null) {
  return normalizeRecoveryIdentifier(username).replace(/^@+/, "").toLowerCase();
}

export function classifyPasswordRecoveryIdentifier(identifier?: string | null): PasswordRecoveryIdentifierKind {
  const normalized = normalizeRecoveryIdentifier(identifier);
  if (!normalized) {
    return "empty";
  }

  if (isEmail(normalized)) {
    return "email";
  }

  if (isPhone(normalized)) {
    return "phone";
  }

  return "username";
}

function isDemoOrLocalEmail(email: string) {
  return email.endsWith("@bvrb3r.demo")
    || email.endsWith("@example.com")
    || email.endsWith("@bvrb3r.local");
}

function toSafeEmail(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!isEmail(normalized) || isDemoOrLocalEmail(normalized)) {
    return null;
  }

  return normalized;
}

function toPhoneCandidates(input: string) {
  const raw = normalizeRecoveryIdentifier(input);
  const digits = getPhoneDigits(raw);
  const normalized = normalizePhone(raw);
  return Array.from(new Set([
    normalized,
    raw,
    digits,
    digits.length === 10 ? `1${digits}` : "",
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : ""
  ].filter(Boolean)));
}

async function readMaybeSingle(label: string, query: unknown) {
  const result = await query as QueryResult;
  if (result.error) {
    if (isSchemaLookupError(result.error)) {
      console.warn("[auth] password recovery lookup skipped unavailable schema", {
        label,
        error: describePasswordRecoveryError(result.error)
      });
      return null;
    }

    throw result.error;
  }

  return result.data && typeof result.data === "object"
    ? result.data as Record<string, unknown>
    : null;
}

async function queryEmailRow(
  client: PasswordRecoveryLookupClient,
  label: ResolvedPasswordRecoveryEmail["source"],
  table: string,
  select: string,
  buildQuery: (query: PasswordRecoveryQueryBuilder) => PasswordRecoveryQueryBuilder,
  readEmail: (row: Record<string, unknown>) => string | null | undefined,
  readProfileId?: (row: Record<string, unknown>) => string | null | undefined
) {
  const row = await readMaybeSingle(
    `${table}:${label}`,
    buildQuery(client.from(table).select(select)).limit(1).maybeSingle()
  );

  const email = toSafeEmail(readEmail(row ?? {}));
  if (!email) {
    return null;
  }

  return {
    email,
    source: label,
    profileId: readProfileId?.(row ?? {}) ?? null
  } satisfies ResolvedPasswordRecoveryEmail;
}

export async function findProfileByEmail(
  client: PasswordRecoveryLookupClient,
  email: string
): Promise<ResolvedPasswordRecoveryEmail | null> {
  const normalized = toSafeEmail(email);
  if (!normalized) {
    return null;
  }

  const profile = await queryEmailRow(
    client,
    "profiles",
    "profiles",
    "id, email",
    (query) => query.eq("email", normalized),
    (row) => row.email as string | null,
    (row) => row.id as string | null
  );

  return profile ?? {
    email: normalized,
    source: "identifier_email",
    profileId: null
  };
}

export async function findProfileByPhone(
  client: PasswordRecoveryLookupClient,
  phone: string
): Promise<ResolvedPasswordRecoveryEmail | null> {
  const candidates = toPhoneCandidates(phone);
  if (!candidates.length) {
    return null;
  }

  for (const candidate of candidates) {
    const profile = await queryEmailRow(
      client,
      "profiles",
      "profiles",
      "id, email, phone",
      (query) => query.eq("phone", candidate),
      (row) => row.email as string | null,
      (row) => row.id as string | null
    );
    if (profile) {
      return profile;
    }
  }

  for (const candidate of candidates) {
    const clientProfile = await queryEmailRow(
      client,
      "client_profiles",
      "client_profiles",
      "profile_email, phone",
      (query) => query.eq("phone", candidate),
      (row) => row.profile_email as string | null
    );
    if (clientProfile) {
      return clientProfile;
    }
  }

  return null;
}

async function findProfileById(client: PasswordRecoveryLookupClient, profileId?: string | null) {
  if (!profileId) {
    return null;
  }

  return queryEmailRow(
    client,
    "profiles",
    "profiles",
    "id, email",
    (query) => query.eq("id", profileId),
    (row) => row.email as string | null,
    (row) => row.id as string | null
  );
}

export async function findProfileByUsername(
  client: PasswordRecoveryLookupClient,
  username: string
): Promise<ResolvedPasswordRecoveryEmail | null> {
  const normalized = normalizeUsername(username);
  if (!normalized) {
    return null;
  }

  const barberProfile = await queryEmailRow(
    client,
    "barber_profiles",
    "barber_profiles",
    "barber_email, username, barber_reference",
    (query) => query.eq("username", normalized),
    (row) => row.barber_email as string | null
  );
  if (barberProfile) {
    return barberProfile;
  }

  const barberReferenceProfile = await queryEmailRow(
    client,
    "barber_profiles",
    "barber_profiles",
    "barber_email, username, barber_reference",
    (query) => query.eq("barber_reference", normalized),
    (row) => row.barber_email as string | null
  );
  if (barberReferenceProfile) {
    return barberReferenceProfile;
  }

  const barberRow = await readMaybeSingle(
    "barbers:username",
    client
      .from("barbers")
      .select("profile_id, booking_slug, reference_code")
      .eq("booking_slug", normalized)
      .limit(1)
      .maybeSingle()
  );
  const barberProfileId = barberRow?.profile_id as string | null | undefined;
  const profile = await findProfileById(client, barberProfileId);
  if (profile) {
    return {
      ...profile,
      source: "barbers"
    };
  }

  return null;
}

export async function resolvePasswordRecoveryEmail(
  client: PasswordRecoveryLookupClient,
  identifier?: string | null
): Promise<ResolvedPasswordRecoveryEmail | null> {
  const normalized = normalizeRecoveryIdentifier(identifier);
  const kind = classifyPasswordRecoveryIdentifier(normalized);
  if (kind === "empty") {
    return null;
  }

  if (kind === "email") {
    return findProfileByEmail(client, normalized);
  }

  if (kind === "phone") {
    return findProfileByPhone(client, normalized);
  }

  return findProfileByUsername(client, normalized);
}
