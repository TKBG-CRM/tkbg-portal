// Complete Stage Configuration for Turnkey Client Journey

export const PHASES: Record<string, { label: string; color: string; order: number }> = {
  new_lead: { label: "New Lead", color: "slate", order: 1 },
  new_sale: { label: "New Sale", color: "violet", order: 2 },
  contract: { label: "Contract", color: "amber", order: 3 },
  pre_site: { label: "Pre-Site", color: "blue", order: 4 },
  construction: { label: "Construction", color: "emerald", order: 5 },
  completed: { label: "Completed", color: "green", order: 6 },
};

export interface StageConfig {
  id: string;
  label: string;
  phase: string;
  order: number;
  nextStages: string[];
  isTerminal?: boolean;
  isOptional?: boolean;
  color: string;
}

export const STAGE_CONFIG: Record<string, StageConfig> = {
  // NEW LEAD
  enquiry_made: { id: "enquiry_made", label: "Enquiry Made", phase: "new_lead", order: 1, nextStages: ["contact_attempted"], color: "slate" },
  contact_attempted: { id: "contact_attempted", label: "Contact Attempted", phase: "new_lead", order: 2, nextStages: ["initial_contact_made"], color: "slate" },
  initial_contact_made: { id: "initial_contact_made", label: "Initial Contact Made", phase: "new_lead", order: 3, nextStages: ["working_enquiry", "discovery_meeting_booked", "out_of_market"], color: "slate" },
  working_enquiry: { id: "working_enquiry", label: "Working Enquiry", phase: "new_lead", order: 4, nextStages: ["discovery_meeting_booked", "out_of_market"], color: "slate" },
  discovery_meeting_booked: { id: "discovery_meeting_booked", label: "Discovery Meeting Booked", phase: "new_lead", order: 5, nextStages: ["discovery_meeting_completed"], color: "blue" },
  discovery_meeting_completed: { id: "discovery_meeting_completed", label: "Discovery Meeting Completed", phase: "new_lead", order: 6, nextStages: ["research"], color: "blue" },
  research: { id: "research", label: "Research", phase: "new_lead", order: 7, nextStages: ["presentation_booked"], color: "purple" },
  presentation_booked: { id: "presentation_booked", label: "Presentation Booked", phase: "new_lead", order: 8, nextStages: ["presentation_completed"], color: "purple" },
  presentation_completed: { id: "presentation_completed", label: "Presentation Completed", phase: "new_lead", order: 9, nextStages: ["research", "finalising_option"], color: "purple" },
  finalising_option: { id: "finalising_option", label: "Finalising Option", phase: "new_lead", order: 10, nextStages: ["initial_deposit_received"], color: "amber" },
  out_of_market: { id: "out_of_market", label: "Out of Market", phase: "new_lead", order: 12, nextStages: [], isTerminal: true, color: "red" },
  // NEW SALE
  initial_deposit_received: { id: "initial_deposit_received", label: "Initial Deposit Received", phase: "new_sale", order: 11, nextStages: ["contract_request_received"], color: "green" },
  contract_request_received: { id: "contract_request_received", label: "Contract Request Received", phase: "new_sale", order: 13, nextStages: ["contract_requested_from_builder"], color: "amber" },
  contract_requested_from_builder: { id: "contract_requested_from_builder", label: "Contract Requested from Builder", phase: "new_sale", order: 14, nextStages: ["contract_received"], color: "amber" },
  contract_received: { id: "contract_received", label: "Contract Received", phase: "new_sale", order: 15, nextStages: ["contract_checked"], color: "amber" },
  contract_checked: { id: "contract_checked", label: "Contract Checked", phase: "new_sale", order: 16, nextStages: ["contract_appointment_booked"], color: "amber" },
  contract_appointment_booked: { id: "contract_appointment_booked", label: "Contract Appointment Booked", phase: "new_sale", order: 17, nextStages: ["contract_appointment_completed"], color: "amber" },
  contract_appointment_completed: { id: "contract_appointment_completed", label: "Contract Appointment Completed", phase: "new_sale", order: 18, nextStages: ["contract_signed"], color: "amber" },
  contract_signed: { id: "contract_signed", label: "Contract Signed", phase: "new_sale", order: 19, nextStages: ["bod_received"], color: "green" },
  bod_received: { id: "bod_received", label: "BOD Received", phase: "new_sale", order: 20, nextStages: ["gift_hamper_sent"], color: "green" },
  gift_hamper_sent: { id: "gift_hamper_sent", label: "Gift Hamper Sent", phase: "new_sale", order: 21, nextStages: ["product_review_requested"], color: "green" },
  product_review_requested: { id: "product_review_requested", label: "Product Review Requested", phase: "new_sale", order: 22, nextStages: ["contract_drawings_received"], color: "green" },
  // PRE-SITE
  contract_drawings_received: { id: "contract_drawings_received", label: "Contract Drawings Received", phase: "pre_site", order: 23, nextStages: ["contract_drawings_signed"], color: "blue" },
  contract_drawings_signed: { id: "contract_drawings_signed", label: "Contract Drawings Signed", phase: "pre_site", order: 24, nextStages: ["variation_requested", "colour_selections_pending", "land_titled"], color: "blue" },
  variation_requested: { id: "variation_requested", label: "Variation Requested", phase: "pre_site", order: 25, nextStages: ["variation_signed"], isOptional: true, color: "amber" },
  variation_signed: { id: "variation_signed", label: "Variation Signed", phase: "pre_site", order: 26, nextStages: ["colour_selections_pending", "land_titled"], isOptional: true, color: "green" },
  colour_selections_pending: { id: "colour_selections_pending", label: "Colour Selections Pending", phase: "pre_site", order: 27, nextStages: ["land_titled"], isOptional: true, color: "purple" },
  land_titled: { id: "land_titled", label: "Land Titled", phase: "pre_site", order: 28, nextStages: ["formal_approval_received"], color: "blue" },
  formal_approval_received: { id: "formal_approval_received", label: "Formal Approval Received", phase: "pre_site", order: 29, nextStages: ["land_settled"], color: "green" },
  land_settled: { id: "land_settled", label: "Land Settled", phase: "pre_site", order: 30, nextStages: ["working_drawings_received"], color: "green" },
  working_drawings_received: { id: "working_drawings_received", label: "Working Drawings Received", phase: "pre_site", order: 31, nextStages: ["working_drawings_signed"], color: "blue" },
  working_drawings_signed: { id: "working_drawings_signed", label: "Working Drawings Signed", phase: "pre_site", order: 32, nextStages: ["building_permit_received"], color: "green" },
  building_permit_received: { id: "building_permit_received", label: "Building Permit Received", phase: "pre_site", order: 33, nextStages: ["site_start"], color: "green" },
  site_start: { id: "site_start", label: "Site Start", phase: "pre_site", order: 34, nextStages: ["construction_base"], color: "emerald" },
  // CONSTRUCTION
  construction_base: { id: "construction_base", label: "Base", phase: "construction", order: 35, nextStages: ["construction_frame"], color: "emerald" },
  construction_frame: { id: "construction_frame", label: "Frame", phase: "construction", order: 36, nextStages: ["construction_lockup"], color: "emerald" },
  construction_lockup: { id: "construction_lockup", label: "Lockup", phase: "construction", order: 37, nextStages: ["construction_fixout"], color: "emerald" },
  construction_fixout: { id: "construction_fixout", label: "Fixout", phase: "construction", order: 38, nextStages: ["construction_completion"], color: "emerald" },
  construction_completion: { id: "construction_completion", label: "Completion", phase: "construction", order: 39, nextStages: ["handover_completed"], color: "emerald" },
  // COMPLETED
  handover_completed: { id: "handover_completed", label: "Handover Completed", phase: "completed", order: 40, nextStages: [], isTerminal: true, color: "green" },
};

export function getStageLabel(stageId: string): string {
  return STAGE_CONFIG[stageId]?.label || stageId?.replace(/_/g, " ") || "";
}

export function getStageConfig(stageId: string): StageConfig | null {
  return STAGE_CONFIG[stageId] || null;
}

export function getAllStagesOrdered(): StageConfig[] {
  return Object.values(STAGE_CONFIG).sort((a, b) => a.order - b.order);
}

export function getStagesByPhase(phase: string): StageConfig[] {
  return Object.values(STAGE_CONFIG)
    .filter((s) => s.phase === phase)
    .sort((a, b) => a.order - b.order);
}

export function getProgressPercentage(stageId: string): number {
  const config = STAGE_CONFIG[stageId];
  if (!config) return 0;
  const total = Object.keys(STAGE_CONFIG).length;
  return Math.round((config.order / total) * 100);
}

// Pipeline section config
export const PIPELINE_SECTIONS = [
  { id: "new_lead", label: "New Lead", color: "bg-neutral-900", lightColor: "bg-neutral-50", borderColor: "border-neutral-300", dotColor: "bg-neutral-500", phases: ["new_lead"] },
  { id: "new_sale", label: "New Sale", color: "bg-black", lightColor: "bg-[#957B60]/5", borderColor: "border-[#957B60]/30", dotColor: "bg-[#957B60]", phases: ["new_sale"] },
  { id: "pre_site", label: "Pre Site", color: "bg-neutral-800", lightColor: "bg-neutral-50", borderColor: "border-neutral-200", dotColor: "bg-neutral-500", phases: ["pre_site"] },
  { id: "on_site", label: "On Site", color: "bg-black", lightColor: "bg-[#957B60]/5", borderColor: "border-[#957B60]/25", dotColor: "bg-[#957B60]", phases: ["construction"] },
  { id: "completed", label: "Completed", color: "bg-neutral-700", lightColor: "bg-neutral-50", borderColor: "border-neutral-200", dotColor: "bg-neutral-400", phases: ["completed"] },
];
