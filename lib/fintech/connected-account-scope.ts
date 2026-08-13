const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MembershipLocationInput = {
  id: string;
  location_id: string | null;
};

type ResolvedMembershipLocationContext = {
  location: { id: string } | null;
};

export function resolveMembershipConnectedAccountLocationId(
  membership: MembershipLocationInput,
  context?: ResolvedMembershipLocationContext
) {
  const locationId = context?.location?.id ?? membership.location_id;
  return locationId && UUID_PATTERN.test(locationId) ? locationId : null;
}

export function collectConnectedAccountLocationIds(
  memberships: MembershipLocationInput[],
  contexts: ReadonlyMap<string, ResolvedMembershipLocationContext>
) {
  return [...new Set(
    memberships
      .map((membership) => resolveMembershipConnectedAccountLocationId(membership, contexts.get(membership.id)))
      .filter((locationId): locationId is string => Boolean(locationId))
  )];
}
