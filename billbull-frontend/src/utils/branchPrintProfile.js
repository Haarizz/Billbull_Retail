/**
 * Builds the header profile passed to print/email renderers.
 *
 * Rule from the Branch / Outlet spec (Section 7.1): the print header always
 * reflects the branch under which the original transaction was created —
 * regardless of who is printing or which branch they're currently on.
 *
 * Resolution order:
 *   1. If a specific branch ID is given and matches a known branch → use that
 *      branch's profile, with company as fallback for unset fields.
 *   2. Otherwise → use the company profile as-is.
 *
 * For 'All Branches' reports (no specific branch), call with the HQ branch.
 */
export const buildDocumentHeaderProfile = ({ company = {}, branches = [], branchId = null }) => {
    if (!branchId) {
        return company;
    }

    const branch = (branches || []).find((b) => Number(b?.id) === Number(branchId));
    if (!branch) {
        return company;
    }

    // Compose a full address from the branch's structured fields.
    const branchAddressParts = [
        branch.address,
        branch.addressLine2,
        branch.city,
        branch.state,
        branch.postalCode,
        branch.country,
    ].filter((part) => part && String(part).trim());
    const branchAddress = branchAddressParts.join(', ');

    // Branch values take precedence; company fields fill gaps (e.g. currency,
    // stamp, website) and remain visible.
    return {
        ...company,
        companyName: branch.name || company.companyName,
        address: branchAddress || company.address,
        phone: branch.phone || company.phone,
        email: branch.email || company.email,
        trn: branch.trnNumber || company.trn,
        fax: branch.fax || company.fax,
        logoUrl: branch.logoUrl || company.logoUrl,
        stampUrl: branch.stampUrl || company.stampUrl,
        // Bank details for the document footer come from the branch first;
        // company values fill any gaps so an unset branch still prints something.
        bankName: branch.bankName || company.bankName,
        bankAccountNumber: branch.bankAccountNumber || company.bankAccountNumber,
        bankIban: branch.bankIban || company.bankIban,
        bankSwift: branch.bankSwift || company.bankSwift,
        // Carry useful context the templates may reference.
        branchName: branch.name,
        branchCode: branch.code,
        isHeadquarters: Boolean(branch.isHeadquarters),
    };
};

/**
 * Resolves the header for reports. PDF §7.3: when the report is run for
 * "All Branches" (no specific branchId), the header MUST show Headquarters
 * branding. For a specific branch, defers to {@link buildDocumentHeaderProfile}.
 *
 * @param activeBranchId  null/'ALL' for All-Branches, or a specific id
 * @param branches        the full branch list (with isHeadquarters flag)
 * @returns               a profile suitable for the print/email renderer
 */
export const buildReportHeaderProfile = ({ company = {}, branches = [], activeBranchId = null }) => {
    const isAll = activeBranchId === null
        || activeBranchId === undefined
        || activeBranchId === 'ALL';

    if (!isAll) {
        return buildDocumentHeaderProfile({ company, branches, branchId: activeBranchId });
    }

    // All Branches → resolve HQ. Fall back to first branch by sortOrder if no HQ
    // is flagged (matches BranchService.getHeadquarters fallback).
    const list = branches || [];
    const hq = list.find((b) => b?.isHeadquarters)
        || [...list].sort((a, b) => (a?.sortOrder ?? 0) - (b?.sortOrder ?? 0))[0]
        || null;

    if (!hq) {
        return { ...company, isAllBranches: true };
    }

    const profile = buildDocumentHeaderProfile({
        company,
        branches: list,
        branchId: hq.id,
    });
    return { ...profile, isAllBranches: true };
};

