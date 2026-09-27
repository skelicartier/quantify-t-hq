import { redirect } from "next/navigation";

/** The admin area opens on its first tab. */
export default function AdminIndexPage() {
  redirect("/admin/staff");
}
