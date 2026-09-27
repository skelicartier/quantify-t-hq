import { redirect } from "next/navigation";

import { currentStaff } from "@/lib/access/core";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const state = await currentStaff();
  redirect(state === "signed-out" || state === "unavailable" ? "/login" : "/home");
}
