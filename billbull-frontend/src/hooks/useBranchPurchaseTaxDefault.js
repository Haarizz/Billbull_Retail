import { useEffect, useState } from 'react';
import { getBranchTaxSummary } from '../api/taxApi';

/**
 * The Branch Default Purchase Tax Rate (Branch Settings > Tax Configuration) for
 * the given branch, or null until loaded / when it cannot be fetched. Pass the
 * result to vatMath.resolvePurchaseTaxRate() when adding a product line to an
 * LPO, GRN or Purchase Invoice. A null branchId falls back to the backend's
 * active-branch resolution, the same branch a new purchase document is saved to.
 */
export default function useBranchPurchaseTaxDefault(branchId) {
    const [rate, setRate] = useState(null);

    useEffect(() => {
        let cancelled = false;
        getBranchTaxSummary(branchId ?? undefined).then(cfg => {
            if (!cancelled) setRate(cfg?.branchDefaultPurchaseTaxRate ?? null);
        });
        return () => { cancelled = true; };
    }, [branchId]);

    return rate;
}
