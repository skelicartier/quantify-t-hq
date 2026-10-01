import type { CompanyField } from "@/lib/api/company";

/** What each of the company's particulars is called on its page and in a refusal. */
export const COMPANY_FIELD_LABELS: Record<CompanyField, string> = {
  legal_name: "Registered name",
  entity_type: "Legal form",
  former_name: "Former name",
  name_changed_on: "Name changed on",
  registration_number: "Registration number",
  incorporated_on: "Date of incorporation",
  pan: "PAN",
  gstin: "GSTIN",
  udyam: "Udyam registration",
  dpiit: "DPIIT recognition",
  registered_address: "Registered office",
  operating_address: "Where we work from",
  phone: "Telephone",
  email: "E-mail",
  website: "Website",
  signatory_name: "Signs for the company",
  signatory_title: "Their title",
  document_note: "Line on internal documents",
};
