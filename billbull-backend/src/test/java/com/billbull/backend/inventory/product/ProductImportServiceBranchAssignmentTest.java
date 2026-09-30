package com.billbull.backend.inventory.product;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import com.billbull.backend.inventory.brand.Brand;
import com.billbull.backend.inventory.brand.BrandRepository;
import com.billbull.backend.inventory.department.Department;
import com.billbull.backend.inventory.department.DepartmentRepository;
import com.billbull.backend.inventory.units.Unit;
import com.billbull.backend.inventory.units.UnitRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;

/**
 * Drives the real Excel parsing path over the client's actual supplements workbook
 * (Sl. No / Item Code / Item Name / Brand Name / Category) with mocked repositories.
 *
 * Covers the two things the onboarding depends on: the 5-column layout maps onto the
 * right product fields, and every created row is owned by the target branch rather than
 * landing company-wide ("Global").
 */
@ExtendWith(MockitoExtension.class)
class ProductImportServiceBranchAssignmentTest {

    private static final String FIXTURE = "/import/supplements-sample.xlsx";
    private static final int EXPECTED_ROWS = 1498;

    @Mock private ProductRepository productRepo;
    @Mock private BrandRepository brandRepo;
    @Mock private DepartmentRepository departmentRepo;
    @Mock private UnitRepository unitRepo;
    @Mock private ProductPackingRepository packingRepo;
    @Mock private ProductBarcodeRepository barcodeRepo;
    @Mock private ProductMediaRepository mediaRepo;
    @Mock private ProductPriceChangeRepository priceChangeRepo;
    @Mock private ProductImageStorageService imageStorageService;
    @Mock private BranchRepository branchRepo;

    private ProductImportService service;
    private List<Product> saved;

    @BeforeEach
    void setUp() {
        service = new ProductImportService(productRepo, brandRepo, departmentRepo, unitRepo,
                packingRepo, barcodeRepo, mediaRepo, priceChangeRepo, imageStorageService, branchRepo);
        saved = new ArrayList<>();

        AtomicLong ids = new AtomicLong(1);
        lenient().when(productRepo.save(any(Product.class))).thenAnswer(inv -> {
            Product p = inv.getArgument(0);
            if (p.getId() == null) {
                p.setId(ids.getAndIncrement());
            }
            saved.add(p);
            return p;
        });
        lenient().when(productRepo.findByCodeAndBranchIsNull(anyString())).thenReturn(List.of());
        lenient().when(productRepo.findByCodeAndBranch_Id(anyString(), anyLong())).thenReturn(List.of());
        lenient().when(productRepo.existsByCode(anyString())).thenReturn(false);

        lenient().when(brandRepo.findByNameIgnoreCase(anyString())).thenReturn(Optional.empty());
        lenient().when(brandRepo.save(any(Brand.class))).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(departmentRepo.findByNameIgnoreCase(anyString())).thenReturn(Optional.empty());
        lenient().when(departmentRepo.save(any(Department.class))).thenAnswer(inv -> inv.getArgument(0));

        lenient().when(unitRepo.findBySymbolIgnoreCaseAndIsActiveTrue(anyString())).thenReturn(Optional.empty());
        lenient().when(unitRepo.findByNameIgnoreCaseAndIsActiveTrue(anyString())).thenReturn(Optional.empty());
        lenient().when(unitRepo.findByIsActiveTrueOrderByNameAsc()).thenReturn(List.of());
        lenient().when(unitRepo.save(any(Unit.class))).thenAnswer(inv -> inv.getArgument(0));

        lenient().when(barcodeRepo.findFirstByBarcode(anyString())).thenReturn(Optional.empty());
        lenient().when(barcodeRepo.findByProductId(any())).thenReturn(Collections.emptyList());
        lenient().when(barcodeRepo.save(any(ProductBarcode.class))).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(packingRepo.findByProductId(any())).thenReturn(Collections.emptyList());
        lenient().when(packingRepo.save(any(ProductPacking.class))).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(mediaRepo.findByProductIdAndIsPrimaryTrue(any())).thenReturn(Optional.empty());
    }

    private MockMultipartFile fixture() throws Exception {
        try (InputStream in = getClass().getResourceAsStream(FIXTURE)) {
            assertThat(in).as("fixture %s on test classpath", FIXTURE).isNotNull();
            return new MockMultipartFile("file", "supplements.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", in.readAllBytes());
        }
    }

    @Test
    void importsEveryRowOfTheSupplementsWorkbookIntoTheTargetBranch() throws Exception {
        Branch target = new Branch();
        target.setId(42L);
        target.setName("Extreme Sports - Supplements");
        when(branchRepo.findById(42L)).thenReturn(Optional.of(target));

        service.importProducts(fixture(), 42L);

        assertThat(saved).hasSize(EXPECTED_ROWS);
        assertThat(saved).allSatisfy(p -> assertThat(p.getBranch())
                .as("product %s must be owned by the target branch, not global", p.getCode())
                .isSameAs(target));
    }

    @Test
    void mapsTheFiveColumnLayoutOntoCodeNameAndBrand() throws Exception {
        Branch target = new Branch();
        target.setId(42L);
        target.setName("Extreme Sports - Supplements");
        when(branchRepo.findById(42L)).thenReturn(Optional.of(target));

        service.importProducts(fixture(), 42L);

        Product first = saved.get(0);
        assertThat(first.getCode()).isEqualTo("AN0001");
        assertThat(first.getName()).isEqualTo("Zinc 90 Veggie Capsules");
        assertThat(first.getBrand().getName()).isEqualTo("APPLIED NUTRITION");

        // "Item Code" must never be mistaken for the name column (the legacy SKU/Item swap path).
        assertThat(saved).noneSatisfy(p -> assertThat(p.getName()).isEqualTo(p.getCode()));
    }

    @Test
    void importWithoutABranchStaysCompanyWide() throws Exception {
        service.importProducts(fixture(), null);

        assertThat(saved).hasSize(EXPECTED_ROWS);
        assertThat(saved).allSatisfy(p -> assertThat(p.getBranch()).isNull());
    }
}
