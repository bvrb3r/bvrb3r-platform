"use client";

type GuardState<T> = {
  promise: Promise<T>;
  resolvedAt?: number;
  value?: T;
};

const actionGuards = new Map<string, GuardState<unknown>>();
const DEFAULT_DEDUPE_WINDOW_MS = 8_000;

export async function runGuardedAction<T>(
  key: string,
  action: () => Promise<T>,
  options?: { dedupeWindowMs?: number }
): Promise<T> {
  const dedupeWindowMs = options?.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
  const existing = actionGuards.get(key) as GuardState<T> | undefined;
  const now = Date.now();

  if (existing) {
    if (existing.resolvedAt && now - existing.resolvedAt <= dedupeWindowMs) {
      return existing.value as T;
    }

    if (!existing.resolvedAt) {
      return existing.promise;
    }
  }

  const promise = action()
    .then((value) => {
      actionGuards.set(key, {
        promise: Promise.resolve(value),
        resolvedAt: Date.now(),
        value
      });

      window.setTimeout(() => {
        const current = actionGuards.get(key) as GuardState<T> | undefined;
        if (current?.resolvedAt && Date.now() - current.resolvedAt >= dedupeWindowMs) {
          actionGuards.delete(key);
        }
      }, dedupeWindowMs);

      return value;
    })
    .catch((error) => {
      actionGuards.delete(key);
      throw error;
    });

  actionGuards.set(key, { promise });
  return promise;
}

export function resetActionGuardsForTests() {
  actionGuards.clear();
}
