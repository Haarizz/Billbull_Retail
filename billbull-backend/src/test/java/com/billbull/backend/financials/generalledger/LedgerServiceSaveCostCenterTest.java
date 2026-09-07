package com.billbull.backend.financials.generalledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.chartofaccounts.CostCenter;
import com.billbull.backend.financials.chartofaccounts.CostCenterRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;

/**
 * Cost center codes are allocated server-side. The browser used to derive the next code from
 * the length of the *branch-scoped* list it had loaded, so a user who could see no cost centers
 * proposed CC-001, collided with the seeded cc-default on the unique index, and got an opaque
 * 500 behind "Failed to save Cost Center".
 */
@ExtendWith(MockitoExtension.class)
class LedgerServiceSaveCostCenterTest {

    @Mock
    private CostCenterRepository costCenterRepo;

    @Mock
    private BranchRepository branchRepository;

    @InjectMocks
    private LedgerService ledgerService;

    @Test
    void blankCodeIsAllocatedFromEveryCostCenterNotJustTheVisibleOnes() {
        when(costCenterRepo.findAll()).thenReturn(List.of(costCenter("cc-default", "CC-001", "General")));
        when(costCenterRepo.findByCode("CC-002")).thenReturn(null);
        when(costCenterRepo.save(any(CostCenter.class))).thenAnswer(inv -> inv.getArgument(0));

        CostCenter submitted = costCenter(null, null, "Marketing");
        CostCenter saved = ledgerService.saveCostCenter(submitted);

        assertThat(saved.getCode()).isEqualTo("CC-002");
        assertThat(saved.getId()).isNotBlank();
        assertThat(saved.getStatus()).isEqualTo("active");
    }

    @Test
    void allocationSkipsCodesAlreadyTakenRatherThanCountingRows() {
        // Only two rows exist, but they occupy CC-001 and CC-003 — a count-based scheme would
        // propose CC-003 and collide.
        when(costCenterRepo.findAll()).thenReturn(List.of(
                costCenter("a", "CC-001", "General"),
                costCenter("b", "CC-003", "Logistics")));
        when(costCenterRepo.findByCode("CC-002")).thenReturn(null);
        when(costCenterRepo.save(any(CostCenter.class))).thenAnswer(inv -> inv.getArgument(0));

        assertThat(ledgerService.saveCostCenter(costCenter(null, "  ", "Marketing")).getCode())
                .isEqualTo("CC-002");
    }

    @Test
    void aTypedDuplicateCodeIsRejectedWithAReasonInsteadOfHittingTheUniqueIndex() {
        when(costCenterRepo.findByCode("CC-001"))
                .thenReturn(costCenter("cc-default", "CC-001", "General / Head Office"));

        assertThatThrownBy(() -> ledgerService.saveCostCenter(costCenter(null, "CC-001", "Marketing")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("CC-001")
                .hasMessageContaining("General / Head Office");

        verify(costCenterRepo, never()).save(any(CostCenter.class));
    }

    @Test
    void theBranchLabelIsResolvedSoBranchIdIsPopulated() {
        Branch warehouse = branch(2L, "Warehouse Branch");

        when(costCenterRepo.findByCode("CC-010")).thenReturn(null);
        when(branchRepository.findAll()).thenReturn(List.of(branch(1L, "Head Office"), warehouse));
        when(costCenterRepo.save(any(CostCenter.class))).thenAnswer(inv -> inv.getArgument(0));

        CostCenter submitted = costCenter(null, "CC-010", "Warehouse Ops");
        submitted.setBranch("Warehouse Branch");

        assertThat(ledgerService.saveCostCenter(submitted).getBranchEntity()).isSameAs(warehouse);
    }

    @Test
    void anAmbiguousBranchNameLeavesBranchIdNullInsteadOfFailingTheSave() {
        // Branch names are not unique — one live tenant has twenty branches called "IT Branch".
        // The derived Optional query behind BranchAccessService.findBranchByName throws on that,
        // which would fail the very save this change exists to fix.
        when(costCenterRepo.findByCode("CC-011")).thenReturn(null);
        when(branchRepository.findAll()).thenReturn(List.of(branch(3L, "IT Branch"), branch(4L, "IT Branch")));
        when(costCenterRepo.save(any(CostCenter.class))).thenAnswer(inv -> inv.getArgument(0));

        CostCenter submitted = costCenter(null, "CC-011", "IT Ops");
        submitted.setBranch("IT Branch");

        CostCenter saved = ledgerService.saveCostCenter(submitted);

        assertThat(saved.getBranchEntity()).isNull();
        assertThat(saved.getCode()).isEqualTo("CC-011");
    }

    @Test
    void theAllBranchesPlaceholderIsNotTreatedAsABranchName() {
        when(costCenterRepo.findByCode("CC-012")).thenReturn(null);
        when(costCenterRepo.save(any(CostCenter.class))).thenAnswer(inv -> inv.getArgument(0));

        CostCenter submitted = costCenter(null, "CC-012", "Company-wide");
        submitted.setBranch("All Branches");

        assertThat(ledgerService.saveCostCenter(submitted).getBranchEntity()).isNull();
        verify(branchRepository, never()).findAll();
    }

    private static Branch branch(Long id, String name) {
        Branch branch = new Branch();
        branch.setId(id);
        branch.setName(name);
        return branch;
    }

    private static CostCenter costCenter(String id, String code, String name) {
        CostCenter cc = new CostCenter();
        cc.setId(id);
        cc.setCode(code);
        cc.setName(name);
        return cc;
    }
}
