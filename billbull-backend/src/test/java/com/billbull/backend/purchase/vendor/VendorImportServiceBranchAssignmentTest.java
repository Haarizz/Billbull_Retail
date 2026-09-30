package com.billbull.backend.purchase.vendor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;

/**
 * Vendors imported while scoped to a branch must carry that branch, not land unattributed.
 * {@code VendorRepository.searchVendors} treats {@code branch_id IS NULL} as visible to EVERY
 * branch, so an unattributed import silently breaks branch-level segregation.
 */
@ExtendWith(MockitoExtension.class)
class VendorImportServiceBranchAssignmentTest {

    @Mock private VendorRepository repository;
    @Mock private BranchRepository branchRepo;

    private VendorImportService service;
    private List<Vendor> saved;

    @BeforeEach
    void setUp() {
        service = new VendorImportService(repository, branchRepo);
        saved = new ArrayList<>();
        lenient().when(repository.findByCode(anyString())).thenReturn(Optional.empty());
        lenient().when(repository.save(any(Vendor.class))).thenAnswer(inv -> {
            saved.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
    }

    /** Standard BillBull export: "Vendor Code" header in column A, code in A, name in D. */
    private MockMultipartFile workbook() throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Vendors");
            Row header = sheet.createRow(0);
            header.createCell(0).setCellValue("Vendor Code");
            header.createCell(3).setCellValue("Vendor Name");
            for (int i = 1; i <= 3; i++) {
                Row row = sheet.createRow(i);
                row.createCell(0).setCellValue("VEND-00" + i);
                row.createCell(3).setCellValue("Supplier " + i);
            }
            wb.write(out);
            return new MockMultipartFile("file", "vendors.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", out.toByteArray());
        }
    }

    private Branch branch() {
        Branch b = new Branch();
        b.setId(42L);
        b.setName("Extreme Sports - Supplements");
        return b;
    }

    @Test
    void assignsTheTargetBranchAndADefaultAllocationToImportedVendors() throws Exception {
        Branch target = branch();
        when(branchRepo.findById(42L)).thenReturn(Optional.of(target));

        service.importVendors(workbook(), 42L);

        assertThat(saved).hasSize(3);
        assertThat(saved).allSatisfy(v -> {
            assertThat(v.getBranch()).as("owning branch FK").isSameAs(target);
            assertThat(v.getBranchAllocations()).hasSize(1);
            assertThat(v.getBranchAllocations().get(0).getBranch()).isSameAs(target);
            assertThat(v.getBranchAllocations().get(0).isDefault()).isTrue();
        });
    }

    @Test
    void importWithoutABranchStaysUnattributed() throws Exception {
        service.importVendors(workbook(), null);

        assertThat(saved).hasSize(3);
        assertThat(saved).allSatisfy(v -> {
            assertThat(v.getBranch()).isNull();
            assertThat(v.getBranchAllocations()).isEmpty();
        });
    }

    @Test
    void existingVendorsAreNeverReHomedToTheImportingBranch() throws Exception {
        Branch target = branch();
        when(branchRepo.findById(42L)).thenReturn(Optional.of(target));

        Branch otherBranch = new Branch();
        otherBranch.setId(7L);
        otherBranch.setName("Head Office");
        Vendor existing = new Vendor();
        existing.setCode("VEND-001");
        existing.setBranch(otherBranch);
        when(repository.findByCode("VEND-001")).thenReturn(Optional.of(existing));

        service.importVendors(workbook(), 42L);

        assertThat(existing.getBranch()).as("pre-existing vendor keeps its own branch").isSameAs(otherBranch);
        assertThat(existing.getBranchAllocations()).isEmpty();
    }
}
