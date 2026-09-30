package com.billbull.backend.sales.customerledger;

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
 * Customers imported while scoped to a branch must carry that branch on {@code branchEntity} —
 * the FK the scoping predicate reads — not merely the legacy free-text {@code branch} label.
 * {@code branch_id IS NULL} is treated as visible to EVERY branch.
 */
@ExtendWith(MockitoExtension.class)
class CustomerImportServiceBranchAssignmentTest {

    @Mock private CustomerRepository repository;
    @Mock private BranchRepository branchRepo;

    private CustomerImportService service;
    private List<Customer> saved;

    @BeforeEach
    void setUp() {
        service = new CustomerImportService(repository, branchRepo);
        saved = new ArrayList<>();
        lenient().when(repository.findByCode(anyString())).thenReturn(Optional.empty());
        lenient().when(repository.save(any(Customer.class))).thenAnswer(inv -> {
            saved.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
    }

    /** Standard BillBull export: "Customer Code" header in column A, code in A, name in B. */
    private MockMultipartFile workbook() throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Customers");
            Row header = sheet.createRow(0);
            header.createCell(0).setCellValue("Customer Code");
            header.createCell(1).setCellValue("Customer Name");
            for (int i = 1; i <= 3; i++) {
                Row row = sheet.createRow(i);
                row.createCell(0).setCellValue("CUST-00" + i);
                row.createCell(1).setCellValue("Gym Customer " + i);
            }
            wb.write(out);
            return new MockMultipartFile("file", "customers.xlsx",
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
    void assignsTheTargetBranchAndADefaultAllocationToImportedCustomers() throws Exception {
        Branch target = branch();
        when(branchRepo.findById(42L)).thenReturn(Optional.of(target));

        service.importCustomers(workbook(), 42L);

        assertThat(saved).hasSize(3);
        assertThat(saved).allSatisfy(c -> {
            assertThat(c.getBranchEntity()).as("owning branch FK, not the legacy label").isSameAs(target);
            assertThat(c.getBranchAllocations()).hasSize(1);
            assertThat(c.getBranchAllocations().get(0).getBranch()).isSameAs(target);
            assertThat(c.getBranchAllocations().get(0).isDefault()).isTrue();
        });
    }

    @Test
    void importWithoutABranchStaysUnattributed() throws Exception {
        service.importCustomers(workbook(), null);

        assertThat(saved).hasSize(3);
        assertThat(saved).allSatisfy(c -> {
            assertThat(c.getBranchEntity()).isNull();
            assertThat(c.getBranchAllocations()).isEmpty();
        });
    }

    @Test
    void existingCustomersAreNeverReHomedToTheImportingBranch() throws Exception {
        Branch target = branch();
        when(branchRepo.findById(42L)).thenReturn(Optional.of(target));

        Branch otherBranch = new Branch();
        otherBranch.setId(7L);
        otherBranch.setName("Head Office");
        Customer existing = new Customer();
        existing.setCode("CUST-001");
        existing.setBranchEntity(otherBranch);
        when(repository.findByCode("CUST-001")).thenReturn(Optional.of(existing));

        service.importCustomers(workbook(), 42L);

        assertThat(existing.getBranchEntity()).as("pre-existing customer keeps its own branch").isSameAs(otherBranch);
        assertThat(existing.getBranchAllocations()).isEmpty();
    }
}
