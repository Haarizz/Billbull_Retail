import React, { createContext, useContext, useState, useEffect } from 'react';
import { getBranches, getDefaultBranch } from '../api/branchApi';
import { getUserProfile } from '../api/auth';

const BranchContext = createContext(null);

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
        address: normalizeText(branch.address),
        phone: normalizeText(branch.phone),
        isDefault: Boolean(branch.isDefault),
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
        isDefault: normalizedPreferred?.isDefault ?? normalizedFallback?.isDefault ?? false,
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

export const BranchProvider = ({ children }) => {
    const [defaultBranch, setDefaultBranch] = useState(null);
    const [branches, setBranches] = useState([]);

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
            return;
        }

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
        setDefaultBranch(resolvedDefaultBranch || finalBranches.find((branch) => branch.isDefault) || null);
    };

    useEffect(() => {
        load();
    }, []);

    const branchNames = branches
        .map((branch) => branch.name)
        .filter(Boolean);
    const defaultBranchName = defaultBranch?.name || branchNames[0] || '';
    const defaultBranchLabel = formatBranchLabel(defaultBranch);
    const defaultBranchLocationLabel = formatBranchLocationLabel(defaultBranch);

    return (
        <BranchContext.Provider value={{
            defaultBranch,
            branches,
            branchNames,
            defaultBranchName,
            defaultBranchLabel,
            defaultBranchLocationLabel,
            formatBranchLabel,
            formatBranchLocationLabel,
            refreshDefaultBranch: load,
            refreshBranches: load,
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
