package com.billbull.backend.sales.pricing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductPackingRepository;
import com.billbull.backend.inventory.product.ProductPriceChange;
import com.billbull.backend.inventory.product.ProductPriceChangeRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.settings.branch.BranchRepository;

/** Quantity-tier configuration: validation, duplicates, branch scope, versioning, deactivation. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ProductQuantityTierServiceTest {

    @Mock ProductQuantityTierRepository repository;
    @Mock PriceLevelRepository levelRepository;
    @Mock ProductRepository productRepository;
    @Mock ProductPackingRepository packingRepository;
    @Mock BranchRepository branchRepository;
    @Mock ProductPriceChangeRepository priceChangeRepository;

    ProductQuantityTierService service;
    final List<ProductQuantityTier> rows = new ArrayList<>();
    long nextId = 1;
    PriceLevel retail;
    PriceLevel wholesale;

    @BeforeEach
    void setUp() {
        service = new ProductQuantityTierService(repository, levelRepository, productRepository, packingRepository,
                branchRepository, priceChangeRepository);
        retail = level(1L, "Retail", true);
        wholesale = level(2L, "Wholesale", false);
        when(levelRepository.findAll()).thenReturn(List.of(retail, wholesale));
        Product p = new Product();
        p.setId(10L);
        p.setCode("A");
        p.setName("Product A");
        p.setActive(true);
        when(productRepository.findById(10L)).thenReturn(Optional.of(p));
        when(productRepository.findAllById(any())).thenReturn(List.of(p));
        when(branchRepository.existsById(anyLong())).thenReturn(true);
        when(branchRepository.findAllById(any())).thenReturn(List.of());
        when(packingRepository.findByProductIdIn(any())).thenReturn(List.of());
        when(repository.lockLive(anyLong(), anyLong())).thenAnswer(inv -> rows.stream()
                .filter(t -> t.isActive() && t.getProductId().equals(inv.getArgument(0))
                        && t.getPriceLevelId().equals(inv.getArgument(1)))
                .toList());
        when(repository.findById(anyLong())).thenAnswer(inv -> rows.stream()
                .filter(t -> t.getId().equals(inv.getArgument(0))).findFirst());
        when(repository.save(any())).thenAnswer(inv -> {
            ProductQuantityTier t = inv.getArgument(0);
            if (t.getId() == null) {
                t.setId(nextId++);
                rows.add(t);
            }
            return t;
        });
    }

    @AfterEach
    void clearBranch() {
        BranchContextHolder.clear();
    }

    @Test
    void createsATierAndAuditsIt() {
        TierResult r = create(wholesale, null, "20", "25");
        assertThat(r.response.minQuantity()).isEqualByComparingTo("20");
        assertThat(r.response.price()).isEqualByComparingTo("25.00");
        assertThat(r.response.priceLevelName()).isEqualTo("Wholesale");
        assertThat(r.response.active()).isTrue();
        ArgumentCaptor<ProductPriceChange> audit = ArgumentCaptor.forClass(ProductPriceChange.class);
        verify(priceChangeRepository).save(audit.capture());
        assertThat(audit.getValue().getPriceLevel()).isEqualTo("T:Wholesale 20+");
    }

    @Test
    void tiersMayBeSetOnTheDefaultLevel() {
        assertThat(create(retail, null, "20", "28").response.priceLevelName()).isEqualTo("Retail");
    }

    @Test
    void rejectsNonPositiveOrOverPreciseValues() {
        assertThatThrownBy(() -> create(wholesale, null, "0", "25")).isInstanceOf(PricingException.class);
        assertThatThrownBy(() -> create(wholesale, null, "-5", "25")).isInstanceOf(PricingException.class);
        assertThatThrownBy(() -> create(wholesale, null, "20", "0")).isInstanceOf(PricingException.class);
        assertThatThrownBy(() -> create(wholesale, null, "20", "-1")).isInstanceOf(PricingException.class);
        assertThatThrownBy(() -> create(wholesale, null, "1.2345", "25")).isInstanceOf(PricingException.class);
        assertThatThrownBy(() -> create(wholesale, null, "20", "25.001")).isInstanceOf(PricingException.class);
        assertThatThrownBy(() -> create(wholesale, null, null, "25")).isInstanceOf(PricingException.class);
        verify(repository, never()).save(any());
    }

    @Test
    void rejectsADuplicateThresholdInTheSameScopeButNotAnotherBranch() {
        create(wholesale, null, "20", "25");
        assertThatThrownBy(() -> create(wholesale, null, "20.000", "24"))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
        // Same threshold for one branch, or under another level, is a different tier.
        create(wholesale, 3L, "20", "24.50");
        create(retail, null, "20", "28");
        assertThat(rows).hasSize(3);
    }

    @Test
    void inactiveLevelCannotTakeNewTiers() {
        wholesale.setActive(false);
        assertThatThrownBy(() -> create(wholesale, null, "20", "25")).isInstanceOf(PricingException.class);
    }

    @Test
    void branchUserCannotWriteAllBranchesOrAnotherBranchsTier() {
        BranchContextHolder.set(new BranchContextHolder.BranchContext(3L, Set.of(3L), false));
        assertThatThrownBy(() -> create(wholesale, null, "20", "25"))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThatThrownBy(() -> create(wholesale, 4L, "20", "25"))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThat(create(wholesale, 3L, "20", "25").response.branchId()).isEqualTo(3L);
    }

    @Test
    void editsThresholdAndPrice() {
        TierResult r = create(wholesale, null, "20", "25");
        ProductQuantityTierService.TierRequest edit = request(null, null, "30", "24.50");
        ProductQuantityTierService.TierResponse updated = service.update(r.response.id(), edit);
        assertThat(updated.minQuantity()).isEqualByComparingTo("30");
        assertThat(updated.price()).isEqualByComparingTo("24.50");
    }

    @Test
    void editIntoAnExistingThresholdIsRefused() {
        create(wholesale, null, "20", "25");
        TierResult second = create(wholesale, null, "100", "23");
        assertThatThrownBy(() -> service.update(second.response.id(), request(null, null, "20", "22")))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void staleEditIsRefusedSoNobodyOverwritesAnotherUsersChange() {
        TierResult r = create(wholesale, 3L, "20", "25");
        ProductQuantityTier row = rows.get(0);
        row.setUpdatedAt(LocalDateTime.of(2026, 11, 2, 10, 0));
        ProductQuantityTierService.TierRequest edit = request(null, null, "20", "24");
        edit.setExpectedUpdatedAt(LocalDateTime.of(2026, 11, 2, 9, 0));
        assertThatThrownBy(() -> service.update(r.response.id(), edit))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
        edit.setExpectedUpdatedAt(LocalDateTime.of(2026, 11, 2, 10, 0));
        assertThat(service.update(r.response.id(), edit).price()).isEqualByComparingTo("24.00");
    }

    @Test
    void deactivationKeepsTheRowAndReactivationRechecksDuplicates() {
        TierResult r = create(wholesale, null, "20", "25");
        ProductQuantityTierService.TierResponse off = service.setActive(r.response.id(), false, null);
        assertThat(off.active()).isFalse();
        assertThat(rows).hasSize(1);
        assertThatThrownBy(() -> service.update(r.response.id(), request(null, null, "20", "24")))
                .isInstanceOf(PricingException.class);

        // A new 20+ tier was created meanwhile; the old one can't come back on top of it.
        create(wholesale, null, "20", "24");
        assertThatThrownBy(() -> service.setActive(r.response.id(), true, null))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
    }

    // ------------------------------------------------------------------

    private record TierResult(ProductQuantityTierService.TierResponse response) {}

    private TierResult create(PriceLevel level, Long branchId, String minQty, String price) {
        return new TierResult(service.create(request(level.getId(), branchId, minQty, price)));
    }

    private static ProductQuantityTierService.TierRequest request(Long levelId, Long branchId, String minQty, String price) {
        ProductQuantityTierService.TierRequest r = new ProductQuantityTierService.TierRequest();
        r.setProductId(10L);
        r.setPriceLevelId(levelId);
        r.setBranchId(branchId);
        r.setMinQuantity(minQty != null ? new BigDecimal(minQty) : null);
        r.setPrice(price != null ? new BigDecimal(price) : null);
        return r;
    }

    private PriceLevel level(long id, String name, boolean systemDefault) {
        PriceLevel l = new PriceLevel();
        l.setId(id);
        l.setName(name);
        l.setCode(name.toUpperCase());
        l.setSystemDefault(systemDefault);
        l.setActive(true);
        when(levelRepository.findById(id)).thenReturn(Optional.of(l));
        return l;
    }
}
