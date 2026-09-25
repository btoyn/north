import { redirect } from "next/navigation";

/**
 * The institution index is now a sphere — the same partners, grouped by
 * territory and bank. Individual institution pages are still their own thing at
 * /institutions/[id], which is where a group meeting starts.
 */
export default function InstitutionsRedirect() {
  redirect("/tiers/by-institution");
}
