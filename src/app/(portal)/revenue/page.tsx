import { redirect } from "next/navigation";

/** Revenue opens on its contracts. */
export default function RevenueIndexPage() {
  redirect("/revenue/contracts");
}
