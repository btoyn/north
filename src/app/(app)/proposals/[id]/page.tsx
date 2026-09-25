import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { GroupProposalView, type GroupProposalData } from "./group-proposal-view";

export const metadata = { title: "Group meeting" };

/**
 * One group proposal: who was asked, what each of them said, and which date
 * that adds up to.
 *
 * The page only fetches. Counting the replies by date is wall-clock work and
 * happens in the browser, same as choosing the dates did.
 */
export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: proposal } = await supabase
    .from("meeting_proposals")
    .select(
      "id, lender_id, institution_id, meeting_type, custom_label, offered_slots, location_name, status, sent_at, meeting_id, institution:institutions(name, territory)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!proposal) notFound();
  // A single-partner proposal lives on that partner's page, not here.
  if (proposal.lender_id) redirect(`/partners/${proposal.lender_id}`);

  const { data: attendees } = await supabase
    .from("meeting_proposal_attendees")
    .select(
      "lender_id, reply_text, replied_at, reply_intent, reply_read_at, slot_verdicts, countered_slot, lender:lenders(full_name, first_name, email)",
    )
    .eq("proposal_id", id);

  // Once it is booked, who has actually accepted the invitation. Being on the
  // meeting is not the same as having agreed to come, and only the ones who
  // agreed are counted as covered.
  const { data: booked } = proposal.meeting_id
    ? await supabase
        .from("meeting_attendees")
        .select("response_status, lender:lenders(full_name, first_name)")
        .eq("meeting_id", proposal.meeting_id)
    : { data: null };

  const institution = proposal.institution as unknown as {
    name: string;
    territory: string | null;
  } | null;

  const data: GroupProposalData = {
    id: proposal.id,
    institutionName: institution?.name ?? "this bank",
    meetingType: proposal.meeting_type,
    customLabel: proposal.custom_label,
    offeredSlots: proposal.offered_slots ?? [],
    locationName: proposal.location_name,
    status: proposal.status,
    sentAt: proposal.sent_at,
    meetingId: proposal.meeting_id,
    booked: (booked ?? []).map((a) => {
      const lender = a.lender as unknown as { full_name: string; first_name: string } | null;
      return {
        name: lender?.full_name ?? "Unknown",
        firstName: lender?.first_name ?? "they",
        responseStatus: a.response_status,
      };
    }),
    attendees: (attendees ?? [])
      .map((a) => {
        const lender = a.lender as unknown as {
          full_name: string;
          first_name: string;
          email: string | null;
        } | null;
        return {
          lenderId: a.lender_id,
          name: lender?.full_name ?? "Unknown",
          firstName: lender?.first_name ?? "they",
          repliedAt: a.replied_at,
          replyText: a.reply_text,
          replyIntent: a.reply_intent,
          replyReadAt: a.reply_read_at,
          verdicts: a.slot_verdicts ?? [],
          counteredSlot: a.countered_slot,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  };

  return (
    <>
      <PageHeader
        title={`Group meeting · ${data.institutionName}`}
        description={[institution?.territory, proposal.location_name].filter(Boolean).join(" · ")}
      />
      <GroupProposalView data={data} />
    </>
  );
}
