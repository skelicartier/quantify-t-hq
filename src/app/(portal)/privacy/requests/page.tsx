import { redirect } from "next/navigation";

/** The requests live on the desk's front page; the breadcrumb's "Requests" lands there. */
export default function PrivacyRequestsIndex() {
  redirect("/privacy");
}
