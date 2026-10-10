import { redirect } from "next/navigation";

// Můj web se upravuje přímo ve webu — starší odkazy na /admin/web vedou tam.
export default function WebPage() {
  redirect("/admin/web/builder");
}
