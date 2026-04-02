import { demoAppointments, demoBarbers, demoClients, demoLocations, demoServices, demoUsers } from "@/lib/data/demo";

const payload = {
  users: demoUsers,
  locations: demoLocations,
  services: demoServices,
  barbers: demoBarbers,
  clients: demoClients,
  appointments: demoAppointments
};

console.log(JSON.stringify(payload, null, 2));