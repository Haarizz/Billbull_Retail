package com.billbull.backend.financials.fixedasset;

import com.billbull.backend.financials.generalledger.JournalEntry;
import com.billbull.backend.financials.generalledger.JournalEntryRepository;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;

/**
 * Manages fixed asset register and posts monthly straight-line depreciation journals.
 * PDF §14: Dr Depreciation Expense (6030) / Cr Accumulated Depreciation (1450).
 */
@Service
@Slf4j
public class FixedAssetService {

    private final FixedAssetRepository fixedAssetRepository;
    private final PostingEngineService postingEngineService;
    private final JournalEntryRepository journalEntryRepository;
    private final BranchRepository branchRepository;

    public FixedAssetService(FixedAssetRepository fixedAssetRepository,
                             PostingEngineService postingEngineService,
                             JournalEntryRepository journalEntryRepository,
                             BranchRepository branchRepository) {
        this.fixedAssetRepository = fixedAssetRepository;
        this.postingEngineService = postingEngineService;
        this.journalEntryRepository = journalEntryRepository;
        this.branchRepository = branchRepository;
    }

    public List<FixedAsset> findAll() {
        return fixedAssetRepository.findAll();
    }

    public List<FixedAsset> findByBranch(Long branchId) {
        return fixedAssetRepository.findByBranchIdAndStatus(branchId, FixedAsset.AssetStatus.ACTIVE);
    }

    @Transactional
    public FixedAsset save(FixedAsset asset) {
        if (asset.getDepreciationStartDate() == null) {
            // Default: first day of month following purchase
            LocalDate pd = asset.getPurchaseDate();
            asset.setDepreciationStartDate(pd.plusMonths(1).withDayOfMonth(1));
        }
        if (asset.getAssetAccountCode() == null) asset.setAssetAccountCode("1400");
        if (asset.getAccumDeprecAccountCode() == null) asset.setAccumDeprecAccountCode("1450");
        if (asset.getDepExpenseAccountCode() == null) asset.setDepExpenseAccountCode("6030");
        return fixedAssetRepository.save(asset);
    }

    /**
     * Run depreciation for a given month-end date.
     * Posts one journal per asset: Dr Depreciation Expense / Cr Accumulated Depreciation.
     * Reference: "DEP-{assetCode}-{YYYY-MM}" — idempotent.
     */
    @Transactional
    public int runMonthlyDepreciation(LocalDate runDate) {
        List<FixedAsset> assets = fixedAssetRepository.findActiveAssetsForDepreciation(runDate);
        int posted = 0;
        for (FixedAsset asset : assets) {
            String ref = "DEP-" + asset.getAssetCode() + "-" + runDate.getYear() + "-"
                    + String.format("%02d", runDate.getMonthValue());
            if (journalEntryRepository.existsByReference(ref)) {
                log.debug("[FixedAsset] Depreciation already posted for ref={}", ref);
                continue;
            }

            BigDecimal monthlyDep = asset.getMonthlyDepreciation();
            if (monthlyDep.compareTo(BigDecimal.ZERO) <= 0) continue;

            // Cap: do not depreciate beyond net book value → residual value
            BigDecimal maxRemaining = asset.getNetBookValue().subtract(asset.getResidualValue());
            if (maxRemaining.compareTo(BigDecimal.ZERO) <= 0) {
                asset.setStatus(FixedAsset.AssetStatus.FULLY_DEPRECIATED);
                fixedAssetRepository.save(asset);
                continue;
            }
            BigDecimal depAmount = monthlyDep.min(maxRemaining).setScale(2, RoundingMode.HALF_UP);

            Branch branch = asset.getBranch();
            JournalEntry journal = postingEngineService.createJournalFromDepreciation(
                    ref, runDate, asset.getAssetName(), depAmount,
                    asset.getDepExpenseAccountCode(), asset.getAccumDeprecAccountCode(),
                    asset.getCostCenter(), branch);

            if (journal != null) {
                asset.setAccumulatedDepreciation(
                        asset.getAccumulatedDepreciation().add(depAmount));
                BigDecimal newNbv = asset.getNetBookValue();
                if (newNbv.compareTo(asset.getResidualValue()) <= 0) {
                    asset.setStatus(FixedAsset.AssetStatus.FULLY_DEPRECIATED);
                }
                fixedAssetRepository.save(asset);
                posted++;
            }
        }
        log.info("[FixedAsset] Depreciation run for {} — posted {} journal(s).", runDate, posted);
        return posted;
    }

    /**
     * Dispose an asset: Dr Accumulated Depreciation + Dr Loss on Disposal / Cr Asset.
     */
    @Transactional
    public FixedAsset dispose(Long assetId, LocalDate disposalDate, BigDecimal proceedsAmount, Branch branch) {
        FixedAsset asset = fixedAssetRepository.findById(assetId)
                .orElseThrow(() -> new RuntimeException("Fixed asset not found: " + assetId));

        BigDecimal nbv = asset.getNetBookValue();
        BigDecimal proceeds = proceedsAmount != null ? proceedsAmount : BigDecimal.ZERO;
        BigDecimal gainLoss = proceeds.subtract(nbv); // positive = gain, negative = loss

        postingEngineService.createJournalFromAssetDisposal(
                "DISP-" + asset.getAssetCode(), disposalDate, asset.getAssetName(),
                asset.getPurchaseCost(), asset.getAccumulatedDepreciation(), proceeds, gainLoss,
                asset.getAssetAccountCode(), asset.getAccumDeprecAccountCode(), branch);

        asset.setStatus(FixedAsset.AssetStatus.DISPOSED);
        return fixedAssetRepository.save(asset);
    }
}
