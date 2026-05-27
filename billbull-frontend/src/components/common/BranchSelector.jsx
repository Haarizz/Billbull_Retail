import React, { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, Check, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { useBranch } from '../../context/BranchContext';

const BranchSelector = () => {
    const {
        branches,
        activeBranchId,
        activeBranch,
        isAllBranches,
        canSwitchBranches,
        switchBranch,
        defaultBranch,
        isLoading,
    } = useBranch();

    const [open, setOpen] = useState(false);
    const [switching, setSwitching] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    if (isLoading) return null;
    if (!branches || branches.length === 0) return null;

    // Branch user with a single accessible branch → static label.
    if (!canSwitchBranches && branches.length <= 1) {
        const only = activeBranch || defaultBranch || branches[0];
        if (!only) return null;
        return (
            <div style={staticChip(only.isHeadquarters)}>
                <Building2 size={14} />
                <span style={{ fontWeight: 600 }}>{only.name}</span>
                {only.code && <span style={{ opacity: 0.7 }}>· {only.code}</span>}
            </div>
        );
    }

    const triggerLabel = isAllBranches
        ? 'All Branches'
        : (activeBranch?.name || defaultBranch?.name || 'Select branch');

    const handleSelect = async (value) => {
        if (switching) return;
        setSwitching(true);
        try {
            await switchBranch(value);
            toast.success(value === 'ALL' ? 'Viewing all branches' : 'Branch switched');
            setOpen(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to switch branch');
        } finally {
            setSwitching(false);
        }
    };

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                style={triggerStyle(isAllBranches)}
                disabled={switching}
                title="Switch active branch"
            >
                <Building2 size={14} />
                <span style={{ fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {triggerLabel}
                </span>
                <ChevronDown size={14} style={{ opacity: 0.7 }} />
            </button>

            {open && (
                <div style={dropdownStyle}>
                    {canSwitchBranches && (
                        <button
                            type="button"
                            onClick={() => handleSelect('ALL')}
                            style={itemStyle(isAllBranches)}
                        >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Building2 size={14} />
                                <span style={{ fontWeight: 600 }}>All Branches</span>
                            </span>
                            {isAllBranches && <Check size={14} />}
                        </button>
                    )}

                    {branches.map((branch) => {
                        const selected = !isAllBranches && Number(activeBranchId) === branch.id;
                        return (
                            <button
                                key={branch.id}
                                type="button"
                                onClick={() => handleSelect(branch.id)}
                                style={itemStyle(selected)}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                    <Building2 size={14} />
                                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {branch.name}
                                    </span>
                                    {branch.code && <span style={{ opacity: 0.6, fontSize: 11 }}>· {branch.code}</span>}
                                    {branch.isHeadquarters && (
                                        <span style={hqBadge}>
                                            <Star size={9} fill="currentColor" /> HQ
                                        </span>
                                    )}
                                </span>
                                {selected && <Check size={14} />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const triggerStyle = (isAll) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    background: isAll ? '#FFF8E7' : '#FFFFFF',
    border: `1px solid ${isAll ? '#F5C742' : '#E2E8F0'}`,
    borderRadius: 8,
    fontSize: 13,
    color: '#1E1E1E',
    cursor: 'pointer',
    transition: 'all 0.15s',
});

const staticChip = (isHq) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    background: isHq ? '#FFF8E7' : '#F8FAFC',
    border: `1px solid ${isHq ? '#F5C742' : '#E2E8F0'}`,
    borderRadius: 8,
    fontSize: 13,
    color: '#1E1E1E',
});

const dropdownStyle = {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    minWidth: 240,
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 10,
    boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
    padding: 4,
    zIndex: 100,
    maxHeight: 320,
    overflowY: 'auto',
};

const itemStyle = (selected) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '8px 10px',
    border: 'none',
    background: selected ? '#FFF8E7' : 'transparent',
    color: selected ? '#1E1E1E' : '#334155',
    fontSize: 13,
    cursor: 'pointer',
    borderRadius: 6,
    textAlign: 'left',
});

const hqBadge = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    background: '#FDE6A9',
    color: '#92400E',
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 999,
    marginLeft: 4,
};

export default BranchSelector;
