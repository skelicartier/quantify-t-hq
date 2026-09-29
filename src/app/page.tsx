import { redirect } from "next/navigation";

import { currentStaff } from "@/lib/access/core";
import { devAutologinPersona } from "@/lib/auth/dev-bypass";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const state = await currentStaff();
  // Development only: the demo sign-in stands in for the form (see dev-bypass.ts).
  if (state === "signed-out" && devAutologinPersona()) redirect("/dev/signin?next=%2Fhome");
  redirect(state === "signed-out" || state === "unavailable" ? "/login" : "/home");
}
