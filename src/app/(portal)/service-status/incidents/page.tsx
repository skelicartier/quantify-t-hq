import { redirect } from "next/navigation";

/** Incidents live on the status board; the breadcrumb's "Incidents" lands there. */
export default function StatusIncidentsIndex() {
  redirect("/service-status");
}
