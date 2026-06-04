import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getBranches, getDefaultBranch, switchBranchSession } from '../api/branchApi';
import { getUserProfile, getRoles } from '../api/auth';

const BranchContext = createContext(null);

const ALL_BRANCH_ROLES = ['ADMIN', 'SUPER_ADMIN'];
const ACTIVE_BRANCH_STORAGE_KEY = 'activeBranchId';

const normalizeText = (value) => {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed || null;
};

const normalizeBranch = (branch) => {
    if (!branch) {
        return null;
    }

    return {
        id: branch.id ?? null,
        name: normalizeText(branch.name),
        code: normalizeText(branch.code),
        // Address (top-level and structured sub-parts for print header assembly)
        address: normalizeText(branch.address),
        addressLine2: normalizeText(branch.addressLine2),
        city: normalizeText(branch.city),
        state: normalizeText(branch.state),
        postalCode: normalizeText(branch.postalCode),
        country: normalizeText(branch.country),
        // Contact & identity fields used by print/email header (PDF §7.1 / §7.3)
        phone: normalizeText(branch.phone),
        fax: normalizeText(branch.fax),
        email: normalizeText(branch.email),
        trnNumber: normalizeText(branch.trnNumber),
        logoUrl: normalizeText(branch.logoUrl),
        bankName: normalizeText(branch.bankName),
        bankAccountNumber: normalizeText(branch.bankAccountNumber),
        bankIban: normalizeText(branch.bankIban),
        bankSwift: normalizeText(branch.bankSwift),
        sortOrder: typeof branch.sortOrder === 'number' ? branch.sortOrder : 0,
        type: normalizeText(branch.type) || 'BRANCH',
        isDefault: Boolean(branch.isDefault),
        isHeadquarters: Boolean(branch.isHeadquarters),
        defaultWarehouseId: branch.defaultWarehouseId ?? null,
        defaultWarehouseName: normalizeText(branch.defaultWarehouseName),
        defaultWarehouseBranchName: normalizeText(branch.defaultWarehouseBranchName),
    };
};

const matchesBranch = (left, right) => {
    if (!left || !right) {
        return false;
    }

    if (left.id != null && right.id != null) {
        return left.id === right.id;
    }

    const leftName = normalizeText(left.name)?.toLowerCase();
    const rightName = normalizeText(right.name)?.toLowerCase();
    return Boolean(leftName && rightName && leftName === rightName);
};

const mergeBranchData = (preferred, fallback) => {
    const normalizedPreferred = normalizeBranch(preferred);
    const normalizedFallback = normalizeBranch(fallback);

    if (!normalizedPreferred && !normalizedFallback) {
        return null;
    }

    return {
        ...(normalizedFallback || {}),
        ...(normalizedPreferred || {}),
        id: normalizedPreferred?.id ?? normalizedFallback?.id ?? null,
        // Use || (not ??) because ?? does not coalesce `false`.
        // isDefault and isHeadquarters are branch properties set by the API;
        // the profile branch never carries them, so its `false` must NOT
        // override the API's `true`.
        isDefault: normalizedPreferred?.isDefault || normalizedFallback?.isDefault || false,
        isHeadquarters: normalizedPreferred?.isHeadquarters || normalizedFallback?.isHeadquarters || false,
    };
};

const upsertBranch = (branches, branch) => {
    const normalizedBranch = normalizeBranch(branch);
    if (!normalizedBranch?.name) {
        return branches;
    }

    const existingIndex = branches.findIndex((item) => matchesBranch(item, normalizedBranch));
    if (existingIndex === -1) {
        return [...branches, normalizedBranch];
    }

    const next = [...branches];
    next[existingIndex] = mergeBranchData(normalizedBranch, next[existingIndex]);
    return next;
};

const sortBranches = (branches) => {
    return [...branches].sort((left, right) => {
        if (left.isDefault !== right.isDefault) {
            return left.isDefault ? -1 : 1;
        }

        return (left.name || '').localeCompare(right.name || '');
    });
};

const formatBranchLabel = (branch) => {
    const normalizedBranch = normalizeBranch(branch);
    if (!normalizedBranch?.name) {
        return '';
    }

    return normalizedBranch.code
        ? `${normalizedBranch.name} (${normalizedBranch.code})`
        : normalizedBranch.name;
};

const formatBranchLocationLabel = (branch) => {
    const normalizedBranch = normalizeBranch(branch);
    if (!normalizedBranch?.name) {
        return '';
    }

    const location = normalizedBranch.defaultWarehouseName || normalizedBranch.address;
    const branchLabel = formatBranchLabel(normalizedBranch);

    return location ? `${branchLabel} / ${location}` : branchLabel;
};

const persistActiveBranchId = (value) => {
    if (value === null || value === undefined) {
        sessionStorage.removeItem(ACTIVE_BRANCH_STORAGE_KEY);
    } else {
        sessionStorage.setItem(ACTIVE_BRANCH_STORAGE_KEY, String(value));
    }
};

const userCanAccessAllBranches = () => {
    const roles = getRoles();
    return Array.isArray(roles) && roles.some((r) => ALL_BRANCH_ROLES.includes(r));
};

export const BranchProvider = ({ children }) => {
    const [defaultBranch, setDefaultBranch] = useState(null);
    const [branches, setBranches] = useState([]);
    const [activeBranchId, setActiveBranchIdState] = useState(() => {
        const stored = sessionStorage.getItem(ACTIVE_BRANCH_STORAGE_KEY);
        if (!stored) return null;
        if (stored === 'ALL') return 'ALL';
        const parsed = Number(stored);
        return Number.isFinite(parsed) ? parsed : null;
    });
    const [isLoading, setIsLoading] = useState(() => Boolean(sessionStorage.getItem("token")));

    const isAdmin = userCanAccessAllBranches();
    const isAllBranches = isAdmin && activeBranchId === 'ALL';

    const mapProfileBranch = (profile) => {
        if (!profile?.branchId) {
            return null;
        }

        return normalizeBranch({
            id: profile.branchId,
            name: profile.branchName,
            code: profile.branchCode,
            address: profile.branchAddress,
            phone: profile.branchPhone,
            defaultWarehouseId: profile.defaultWarehouseId,
            defaultWarehouseName: profile.defaultWarehouseName,
            isDefault: false,
        });
    };

    const load = async () => {
        if (!sessionStorage.getItem("token")) {
            setDefaultBranch(null);
            setBranches([]);
            setIsLoading(false);
            persistActiveBranchId(null);
            return;
        }

        setIsLoading(true);
        let profileBranch = null;
        try {
            const profile = await getUserProfile();
            profileBranch = mapProfileBranch(profile);
        } catch {
            // Fall back to the global default branch when the session has no branch-scoped profile data.
        }

        let allBranches = [];
        try {
            const data = await getBranches();
            allBranches = Array.isArray(data)
                ? data.map(normalizeBranch).filter(Boolean)
                : [];
        } catch {
            allBranches = [];
        }

        let mergedBranches = allBranches;
        if (profileBranch) {
            mergedBranches = upsertBranch(mergedBranches, profileBranch);
        }

        let resolvedDefaultBranch = null;
        if (profileBranch) {
            const matchingBranch = mergedBranches.find((branch) => matchesBranch(branch, profileBranch));
            resolvedDefaultBranch = mergeBranchData(profileBranch, matchingBranch);
        }

        if (!resolvedDefaultBranch) {
            const listDefaultBranch = mergedBranches.find((branch) => branch.isDefault);
            if (listDefaultBranch) {
                resolvedDefaultBranch = listDefaultBranch;
            }
        }

        if (!resolvedDefaultBranch) {
            try {
                const data = normalizeBranch(await getDefaultBranch());
                if (data) {
                    mergedBranches = upsertBranch(mergedBranches, data);
                    resolvedDefaultBranch = mergeBranchData(data, resolvedDefaultBranch);
                }
            } catch {
                resolvedDefaultBranch = null;
            }
        }

        const finalBranches = sortBranches(mergedBranches);
        setBranches(finalBranches);
        const resolvedDefault = resolvedDefaultBranch || finalBranches.find((branch) => branch.isDefault) || null;
        setDefaultBranch(resolvedDefault);

        // Seed activeBranchId on first load: admins default to "ALL", restricted users to their branch.
        const stored = sessionStorage.getItem(ACTIVE_BRANCH_STORAGE_KEY);
        if (!stored) {
            const seedAdmin = userCanAccessAllBranches();
            if (seedAdmin) {
                persistActiveBranchId('ALL');
                setActiveBranchIdState('ALL');
            } else if (resolvedDefault?.id != null) {
                persistActiveBranchId(resolvedDefault.id);
                setActiveBranchIdState(resolvedDefault.id);
            }
        }

        setIsLoading(false);
    };

    useEffect(() => {
        load();
        // BranchProvider mounts above the login route, so it runs before the
        // JWT exists. Login emits 'billbull:login' so we can re-load with the
        // newly-issued token (and therefore the user's allowed branch list).
        const handler = () => load();
        window.addEventListener('billbull:login', handler);
        return () => window.removeEventListener('billbull:login', handler);
    }, []);

    const switchBranch = useCallback(async (branchId) => {
        const isAll = branchId === 'ALL' || branchId === null || branchId === undefined;
        const payload = isAll ? null : Number(branchId);

        const result = await switchBranchSession(payload);
        if (result?.token) {
            sessionStorage.setItem('token', result.token);
        }

        const nextValue = isAll ? 'ALL' : payload;
        persistActiveBranchId(nextValue);
        setActiveBranchIdState(nextValue);

        // Notify list pages (or any consumer) so they can re-fetch under the new scope.
        window.dispatchEvent(new CustomEvent('billbull:branch-changed', { detail: { branchId: nextValue } }));
        return result;
    }, []);

    const branchNames = branches
        .map((branch) => branch.name)
        .filter(Boolean);
    const defaultBranchName = defaultBranch?.name || branchNames[0] || '';
    const defaultBranchLabel = formatBranchLabel(defaultBranch);
    const defaultBranchLocationLabel = formatBranchLocationLabel(defaultBranch);

    const activeBranch = activeBranchId === 'ALL' || activeBranchId == null
        ? null
        : branches.find((b) => b.id === Number(activeBranchId)) || null;

    return (
        <BranchContext.Provider value={{
            defaultBranch,
            branches,
            branchNames,
            defaultBranchName,
            defaultBranchLabel,
            defaultBranchLocationLabel,
            isLoading,
            formatBranchLabel,
            formatBranchLocationLabel,
            refreshDefaultBranch: load,
            refreshBranches: load,
            // Phase 1 branch-context additions
            activeBranchId,
            activeBranch,
            isAllBranches,
            canSwitchBranches: isAdmin,
            switchBranch,
        }}>
            {children}
        </BranchContext.Provider>
    );
};

export const useBranch = () => {
    const context = useContext(BranchContext);
    if (!context) throw new Error('useBranch must be used within BranchProvider');
    return context;
};

export default BranchContext;
