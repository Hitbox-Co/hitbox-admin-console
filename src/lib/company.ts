/**
 * The seller's details, as printed on packing slips and other documents.
 *
 * Nothing in the API carries these, so they are configuration: set them in
 * `.env` (NEXT_PUBLIC_ because the slip is built in the browser). Any field
 * left empty is simply not printed — the slip never shows a placeholder as
 * if it were real company data.
 *
 *   NEXT_PUBLIC_COMPANY_NAME="HitBox Collectibles"
 *   NEXT_PUBLIC_COMPANY_LEGAL_NAME="HitBox Collectibles Pvt. Ltd."
 *   NEXT_PUBLIC_COMPANY_ADDRESS="12 Example Road|Andheri East|Mumbai, MH 400069|India"   ← lines split by |
 *   NEXT_PUBLIC_COMPANY_TAX_ID="27ABCDE1234F1Z5"
 *   NEXT_PUBLIC_COMPANY_TAX_LABEL="GSTIN"
 *   NEXT_PUBLIC_COMPANY_REG_NO="U74999MH2024PTC000000"
 *   NEXT_PUBLIC_COMPANY_EMAIL="support@example.com"
 *   NEXT_PUBLIC_COMPANY_PHONE="+91 00000 00000"
 *   NEXT_PUBLIC_COMPANY_WEBSITE="example.com"
 *   NEXT_PUBLIC_COMPANY_RETURNS_NOTE="Returns accepted within 7 days of delivery…"
 */

const env = (v: string | undefined) => (v ?? "").trim();

export interface CompanyDetails {
  name: string;
  legalName: string;
  addressLines: string[];
  taxId: string;
  taxLabel: string;
  regNo: string;
  email: string;
  phone: string;
  website: string;
  returnsNote: string;
}

// Each key is read literally — Next inlines NEXT_PUBLIC_ vars only when the
// full name appears in the source.
export const COMPANY: CompanyDetails = {
  name: env(process.env.NEXT_PUBLIC_COMPANY_NAME) || "HitBox Collectibles",
  legalName: env(process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME),
  addressLines: env(process.env.NEXT_PUBLIC_COMPANY_ADDRESS)
    .split("|")
    .map((l) => l.trim())
    .filter(Boolean),
  taxId: env(process.env.NEXT_PUBLIC_COMPANY_TAX_ID),
  taxLabel: env(process.env.NEXT_PUBLIC_COMPANY_TAX_LABEL) || "GSTIN",
  regNo: env(process.env.NEXT_PUBLIC_COMPANY_REG_NO),
  email: env(process.env.NEXT_PUBLIC_COMPANY_EMAIL),
  phone: env(process.env.NEXT_PUBLIC_COMPANY_PHONE),
  website: env(process.env.NEXT_PUBLIC_COMPANY_WEBSITE),
  returnsNote: env(process.env.NEXT_PUBLIC_COMPANY_RETURNS_NOTE),
};

/** True when only the default name is known — the slip says so to the operator. */
export const companyIncomplete = () => !COMPANY.addressLines.length;
