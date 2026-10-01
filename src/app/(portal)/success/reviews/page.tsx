import { redirect } from "next/navigation";

/** Reviews live on each firm's Success tab; the breadcrumb's "Reviews" leads to the firms. */
export default function ReviewsIndex() {
  redirect("/success");
}
