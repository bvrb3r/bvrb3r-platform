"use client";

import type { Route } from "next";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, History, MessageSquareText, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateMessageThreadMutation } from "@/lib/messages/client";
import { useBarberClientsQuery, type BarberApiError, type BarberClientRelationshipView } from "@/lib/operations/barber-client";
import { currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

type ClientSortMode = "alphabetical" | "most_visits" | "highest_spend";

function formatDateLabel(iso: string | null) {
  if (!iso) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function formatStatusLabel(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function getClientTags(client: BarberClientRelationshipView) {
  const tags: string[] = [];
  if (client.intelligence.loyaltySegment === "vip") {
    tags.push("VIP");
  }
  if (client.retentionTag.toLowerCase() === "repeat" || client.completedAppointments >= 2) {
    tags.push("Repeat");
  }
  if (client.completedAppointments <= 1) {
    tags.push("New");
  }
  return tags.length ? tags : [client.retentionTag];
}

function ClientSkeleton() {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="mt-3 h-4 w-44" />
      <Skeleton className="mt-4 h-4 w-full" />
    </div>
  );
}

export function BarberClientsWorkspace({ barberName }: { barberName: string }) {
  const router = useRouter();
  const clientsQuery = useBarberClientsQuery();
  const createThreadMutation = useCreateMessageThreadMutation();
  const [sortMode, setSortMode] = useState<ClientSortMode>("alphabetical");
  const [selectedClient, setSelectedClient] = useState<BarberClientRelationshipView | null>(null);
  const [statusUpdate, setStatusUpdate] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const clients = useMemo(() => {
    const rows = [...(clientsQuery.data?.clients ?? [])];
    if (sortMode === "most_visits") {
      return rows.sort((left, right) => right.completedAppointments - left.completedAppointments || left.clientName.localeCompare(right.clientName));
    }

    if (sortMode === "highest_spend") {
      return rows.sort((left, right) => right.lifetimeGrossSales - left.lifetimeGrossSales || left.clientName.localeCompare(right.clientName));
    }

    return rows.sort((left, right) => left.clientName.localeCompare(right.clientName));
  }, [clientsQuery.data?.clients, sortMode]);

  async function handleMessage(client: BarberClientRelationshipView) {
    if (!client.messageAppointmentId) {
      return;
    }

    setStatusUpdate(null);
    try {
      const payload = await createThreadMutation.mutateAsync({ appointmentId: client.messageAppointmentId });
      if (payload.thread?.id) {
        router.push(`/workspace/messages/${payload.thread.id}`);
      }
    } catch (error) {
      setStatusUpdate({
        tone: "error",
        message: getReadableActionError(error as BarberApiError)
      });
    }
  }

  function handleBookAgain(client: BarberClientRelationshipView) {
    const params = new URLSearchParams();
    if (clientsQuery.data?.barberId) {
      params.set("barberId", clientsQuery.data.barberId);
    }
    if (client.latestServiceId) {
      params.set("serviceId", client.latestServiceId);
    }

    router.push(`/booking/new${params.size ? `?${params.toString()}` : ""}` as Route);
  }

  return (
    <div className="space-y-4" data-testid="barber-clients-workspace">
      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="surface-label">Client relationships</p>
            <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">
              {barberName}
            </h3>
            <p className="mt-3 text-sm text-white/62">
              Scan spend, repeat value, and last visit fast without turning this into a giant CRM panel.
            </p>
          </div>
          <div className="w-full max-w-[15rem]">
            <Select value={sortMode} onChange={(event) => setSortMode(event.target.value as ClientSortMode)}>
              <option value="alphabetical">A-Z</option>
              <option value="most_visits">Most visits</option>
              <option value="highest_spend">Highest spend</option>
            </Select>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {statusUpdate ? <FeedbackBanner tone={statusUpdate.tone} message={statusUpdate.message} /> : null}
          {clientsQuery.error ? (
            <FeedbackBanner tone="error" message={getReadableActionError(clientsQuery.error as BarberApiError)} />
          ) : null}
        </div>
      </Card>

      <Card className="rounded-[32px] p-3 sm:p-4">
        <div className="hidden rounded-[22px] border border-white/8 bg-black/20 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-white/46 md:grid md:grid-cols-[minmax(0,1.2fr)_160px_140px_170px_260px]">
          <span>Client</span>
          <span>Tags</span>
          <span>Total spend</span>
          <span>Last visit</span>
          <span className="text-right">Actions</span>
        </div>

        <div className="mt-3 space-y-3">
          {clientsQuery.isLoading && !clientsQuery.data ? (
            <>
              <ClientSkeleton />
              <ClientSkeleton />
              <ClientSkeleton />
            </>
          ) : clients.length ? (
            clients.map((client) => (
              <div
                key={client.clientId}
                className="grid gap-3 rounded-[24px] border border-white/8 bg-black/20 p-4 md:grid-cols-[minmax(0,1.2fr)_160px_140px_170px_260px] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-white">{client.clientName}</p>
                  <p className="mt-1 truncate text-sm text-white/55">
                    {client.latestServiceName ?? "Service history unavailable"}
                  </p>
                  {client.lastAppointmentNote ? (
                    <p className="mt-2 truncate text-sm text-white/46">
                      Last note: {client.lastAppointmentNote}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {getClientTags(client).map((tag) => (
                    <span key={tag} className="status-pill text-white/72">
                      {tag}
                    </span>
                  ))}
                </div>
                <div>
                  <p className="text-lg font-semibold text-white">{currency(client.lifetimeGrossSales)}</p>
                  <p className="mt-1 text-sm text-white/55">{client.completedAppointments} visits</p>
                </div>
                <div>
                  <p className="text-sm text-white/76">{formatDateLabel(client.lastVisitAt)}</p>
                  <p className="mt-1 text-sm text-white/48">
                    {client.nextVisitAt ? `Next ${formatDateLabel(client.nextVisitAt)}` : "No next visit yet"}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    className="h-11 px-4"
                    variant="secondary"
                    disabled={createThreadMutation.isPending || !client.canMessage || !client.messageAppointmentId}
                    onClick={() => void handleMessage(client)}
                  >
                    <MessageSquareText className="h-4 w-4" />
                    {createThreadMutation.isPending ? "Opening..." : "Message"}
                  </Button>
                  <Button
                    className="h-11 px-4"
                    variant="secondary"
                    disabled={!clientsQuery.data?.barberId}
                    onClick={() => handleBookAgain(client)}
                  >
                    <ArrowUpRight className="h-4 w-4" />
                    Book again
                  </Button>
                  <Button
                    className="h-11 px-4"
                    variant="ghost"
                    onClick={() => setSelectedClient(client)}
                  >
                    <History className="h-4 w-4" />
                    View history
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-black/18 p-5 text-sm leading-7 text-white/58">
              Clients will appear here as soon as this barber has live appointment history or upcoming bookings on the
              calendar.
            </div>
          )}
        </div>
      </Card>

      <div className="rounded-[24px] border border-white/8 bg-black/20 p-4 text-sm text-white/60">
        <div className="inline-flex items-center gap-2 text-white/78">
          <Users className="h-4 w-4 text-[#baff69]" />
          Relationship list only
        </div>
        <p className="mt-2">This tab stays focused on guest history and quick context. Checkout keeps money controls, and Calendar keeps chair and timing controls.</p>
      </div>

      {selectedClient ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 py-4 sm:items-center"
          role="presentation"
          onClick={() => setSelectedClient(null)}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-label={`Relationship history for ${selectedClient.clientName}`}
            className="w-full max-w-2xl rounded-[32px] p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="surface-label">Relationship history</p>
                <h4 className="mt-3 text-2xl font-semibold text-white">{selectedClient.clientName}</h4>
                <p className="mt-2 text-sm text-white/58">{selectedClient.latestServiceName ?? "Service history building"}</p>
              </div>
              <Button variant="secondary" className="h-10 px-3" onClick={() => setSelectedClient(null)}>
                <X className="h-4 w-4" />
                Close
              </Button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {getClientTags(selectedClient).map((tag) => (
                <span key={tag} className="status-pill text-white/72">
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Total spend</p>
                <p className="mt-3 text-2xl font-semibold">{currency(selectedClient.lifetimeGrossSales)}</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Visits</p>
                <p className="mt-3 text-2xl font-semibold">{selectedClient.completedAppointments}</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Average ticket</p>
                <p className="mt-3 text-2xl font-semibold">{currency(selectedClient.averageTicket)}</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Last visit</p>
                <p className="mt-3 text-base font-semibold text-white">{formatDateLabel(selectedClient.lastVisitAt)}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Retention window</p>
                <p className="mt-3 text-lg font-semibold text-white">{selectedClient.intelligence.rebookingWindow.replaceAll("_", " ")}</p>
                <p className="mt-2 text-sm text-white/58">{selectedClient.relationshipLabel}</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Next best action</p>
                <p className="mt-3 text-sm leading-6 text-white/66">{selectedClient.intelligence.nextBestAction}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Client contact</p>
                <p className="mt-3 text-sm text-white/74">{selectedClient.email || "No email on file"}</p>
                <p className="mt-2 text-sm text-white/58">{selectedClient.phone || "No phone on file"}</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Client notes</p>
                {selectedClient.clientNotes?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedClient.clientNotes.slice(0, 4).map((note) => (
                      <span key={note} className="status-pill text-white/72">
                        {note}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-white/58">
                    No profile notes are on file for this client yet.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Recent visits</p>
              <div className="mt-3 space-y-3">
                {selectedClient.recentVisits?.length ? (
                  selectedClient.recentVisits.map((visit) => (
                    <div
                      key={visit.appointmentId}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-[18px] border border-white/8 bg-black/18 px-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white">{visit.serviceName ?? "Service unavailable"}</p>
                        <p className="mt-1 text-sm text-white/58">{formatDateLabel(visit.startsAt)}</p>
                        <p className="mt-2 text-sm text-white/52">
                          {visit.note ?? "No appointment note captured for this visit."}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="status-pill text-white/72">{formatStatusLabel(visit.status)}</span>
                        <p className="mt-2 text-sm font-medium text-white">{currency(visit.totalAmount)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-white/58">
                    Recent appointment-linked history will appear here as this client books and completes services with this barber.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                className="h-11 px-4"
                variant="secondary"
                disabled={createThreadMutation.isPending || !selectedClient.canMessage || !selectedClient.messageAppointmentId}
                onClick={() => void handleMessage(selectedClient)}
              >
                <MessageSquareText className="h-4 w-4" />
                Message
              </Button>
              <Button
                className="h-11 px-4"
                variant="secondary"
                disabled={!clientsQuery.data?.barberId}
                onClick={() => handleBookAgain(selectedClient)}
              >
                <ArrowUpRight className="h-4 w-4" />
                Book again
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
