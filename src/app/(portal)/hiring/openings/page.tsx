import { redirect } from "next/navigation";

/** The breadcrumb's middle word leads back to the hiring board. */
export default function HiringIndex() {
  redirect("/hiring");
}
