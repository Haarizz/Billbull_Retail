package com.billbull.backend.sales.pricing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyIterable;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
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
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductPriceChange;
import com.billbull.backend.inventory.product.ProductPriceChangeRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.sales.pricing.ProductLevelPriceService.PriceRow;
import com.billbull.backend.sales.pricing.ProductLevelPriceService.PriceRowResponse;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;

/** Pricing Phase 1 — product prices per level, their validation, audit and branch isolation. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ProductLevelPriceServiceTest {

    static final long BRANCH_A = 1L;
    static final long BRANCH_B = 2L;

    @Mock ProductLevelPriceRepository repository;
    @Mock PriceLevelRepository levelRepository;
    @Mock ProductRepository productRepository;
    @Mock BranchRepository branchRepository;
    @Mock ProductPriceChangeRepository priceChangeRepository;

    ProductLevelPriceService service;
    final List<ProductLevelPrice> rows = new ArrayList<>();
    PriceLevel retail;
    PriceLevel wholesale;
    Product product;

    @BeforeEach
    void setUp() {
        service = new ProductLevelPriceService(repository, levelRepository, productRepository,
                branchRepository, priceChangeRepository);
        retail = level(1L, "Retail", true);
        wholesale = level(2L, "Wholesale", false);
        product = new Product();
        product.setId(10L);
        product.setCode("P10");
        product.setActive(true);
        when(productRepository.findById(10L)).thenReturn(Optional.of(product));
        when(branchRepository.existsById(anyLong())).thenReturn(true);
        when(levelRepository.findAll()).thenReturn(List.of(retail, wholesale));
        when(repository.findByProductIdIn(anyCollection())).thenAnswer(inv -> List.copyOf(rows));
        when(repository.findByProductId(10L)).thenAnswer(inv -> List.copyOf(rows));
        when(repository.saveAll(anyIterable())).thenAnswer(inv -> {
            Iterable<ProductLevelPrice> saved = inv.getArgument(0);
            saved.forEach(r -> { if (!rows.contains(r)) rows.add(r); });
            return saved;
        });
        org.mockito.Mockito.doAnswer(inv -> {
            Iterable<ProductLevelPrice> gone = inv.getArgument(0);
            gone.forEach(rows::remove);
            return null;
        }).when(repository).deleteAll(anyIterable());
    }

    @AfterEach
    void clearContext() {
        BranchContextHolder.clear();
    }

    @Test
    void setsUpdatesAndClearsALevelPriceWithAudit() {
        service.upsert(List.of(new PriceRow(10L, 2L, null, new BigDecimal("80"))));
        assertThat(rows).singleElement().satisfies(r -> assertThat(r.getPrice()).isEqualByComparingTo("80.00"));

        service.upsert(List.of(new PriceRow(10L, 2L, null, new BigDecimal("75.5"))));
        assertThat(rows).singleElement().satisfies(r -> assertThat(r.getPrice()).isEqualByComparingTo("75.50"));

        service.upsert(List.of(new PriceRow(10L, 2L, null, null)));
        assertThat(rows).isEmpty();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ProductPriceChange>> audit = ArgumentCaptor.forClass(List.class);
        verify(priceChangeRepository, org.mockito.Mockito.times(3)).saveAll(audit.capture());
        assertThat(audit.getAllValues()).allSatisfy(batch ->
                assertThat(batch).singleElement().satisfies(c -> assertThat(c.getPriceLevel()).isEqualTo("L:Wholesale")));
    }

    @Test
    void belowCostPriceIsRefusedOnlyWhenTheRuleBlocksIt() {
        PricingRulesService rules = org.mockito.Mockito.mock(PricingRulesService.class);
        service.setRules(rules);
        when(rules.costs(org.mockito.ArgumentMatchers.anyCollection(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(java.util.Map.of(10L, new PricingRulesService.Costs(new BigDecimal("50"), new BigDecimal("90"))));

        when(rules.get()).thenReturn(new PricingRulesService.Rules(new BigDecimal("15"), false, new BigDecimal("0.01")));
        service.upsert(List.of(new PriceRow(10L, 2L, null, new BigDecimal("40"))));
        assertThat(rows).singleElement().satisfies(r -> assertThat(r.getPrice()).isEqualByComparingTo("40.00"));

        when(rules.get()).thenReturn(new PricingRulesService.Rules(new BigDecimal("15"), true, new BigDecimal("0.01")));
        org.junit.jupiter.api.Assertions.assertThrows(PricingException.class,
                () -> service.upsert(List.of(new PriceRow(10L, 2L, null, new BigDecimal("45")))));
        service.upsert(List.of(new PriceRow(10L, 2L, null, new BigDecimal("55"))));
        assertThat(rows).singleElement().satisfies(r -> assertThat(r.getPrice()).isEqualByComparingTo("55.00"));
    }

    @Test
    void branchAndAllBranchesPricesAreSeparateCells() {
        service.upsert(List.of(
                new PriceRow(10L, 2L, null, new BigDecimal("80")),
                new PriceRow(10L, 2L, BRANCH_B, new BigDecimal("75"))));

        assertThat(rows).hasSize(2);
        assertThat(rows).extracting(ProductLevelPrice::getBranchId).containsExactlyInAnyOrder(null, BRANCH_B);
    }

    @Test
    void replaceForProductRemovesCellsNotSent() {
        service.upsert(List.of(
                new PriceRow(10L, 2L, null, new BigDecimal("80")),
                new PriceRow(10L, 2L, BRANCH_B, new BigDecimal("75"))));

        service.replaceForProduct(10L, List.of(new PriceRow(null, 2L, null, new BigDecimal("82"))));

        assertThat(rows).singleElement().satisfies(r -> {
            assertThat(r.getBranchId()).isNull();
            assertThat(r.getPrice()).isEqualByComparingTo("82.00");
        });
    }

    @Test
    void theDefaultLevelTakesNoPricesOfItsOwn() {
        assertThatThrownBy(() -> service.upsert(List.of(new PriceRow(10L, 1L, null, new BigDecimal("80")))))
                .isInstanceOf(PricingException.class).hasMessageContaining("default level");
    }

    @Test
    void inactiveOrUnknownLevelsAndNonPositivePricesAreRefused() {
        wholesale.setActive(false);
        assertThatThrownBy(() -> service.upsert(List.of(new PriceRow(10L, 2L, null, new BigDecimal("80")))))
                .isInstanceOf(PricingException.class).hasMessageContaining("inactive");
        wholesale.setActive(true);
        assertThatThrownBy(() -> service.upsert(List.of(new PriceRow(10L, 99L, null, new BigDecimal("80")))))
                .isInstanceOf(PricingException.class).hasMessageContaining("does not exist");
        assertThatThrownBy(() -> service.upsert(List.of(new PriceRow(10L, 2L, null, BigDecimal.ZERO))))
                .isInstanceOf(PricingException.class).hasMessageContaining("greater than zero");
        verify(repository, never()).saveAll(anyIterable());
    }

    // ------------------------------------------------------------------ branch isolation

    @Test
    void branchUserMaySetTheirOwnBranchPrice() {
        restrictTo(BRANCH_A);
        service.upsert(List.of(new PriceRow(10L, 2L, BRANCH_A, new BigDecimal("70"))));
        assertThat(rows).hasSize(1);
    }

    @Test
    void branchUserMayNotSetAnotherBranchsPrice() {
        restrictTo(BRANCH_A);
        assertThatThrownBy(() -> service.upsert(List.of(new PriceRow(10L, 2L, BRANCH_B, new BigDecimal("70")))))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("not accessible");
        assertThat(rows).isEmpty();
    }

    @Test
    void branchUserMayNotSetAnAllBranchesPrice() {
        restrictTo(BRANCH_A);
        assertThatThrownBy(() -> service.upsert(List.of(new PriceRow(10L, 2L, null, new BigDecimal("70")))))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("every branch");
    }

    @Test
    void branchUserSeesAllBranchesAndOwnBranchRowsOnly() {
        service.upsert(List.of(
                new PriceRow(10L, 2L, null, new BigDecimal("80")),
                new PriceRow(10L, 2L, BRANCH_A, new BigDecimal("78")),
                new PriceRow(10L, 2L, BRANCH_B, new BigDecimal("75"))));
        restrictTo(BRANCH_A);

        List<PriceRowResponse> visible = service.listForProducts(List.of(10L));

        assertThat(visible).extracting(PriceRowResponse::branchId).containsExactlyInAnyOrder(null, BRANCH_A);
    }

    @Test
    void replaceByABranchUserLeavesOtherBranchesRowsAlone() {
        service.upsert(List.of(
                new PriceRow(10L, 2L, null, new BigDecimal("80")),
                new PriceRow(10L, 2L, BRANCH_B, new BigDecimal("75"))));
        restrictTo(BRANCH_A);

        service.replaceForProduct(10L, List.of(new PriceRow(null, 2L, BRANCH_A, new BigDecimal("78"))));

        // The all-branches row and branch B's row are outside branch A's writable scope.
        assertThat(rows).extracting(ProductLevelPrice::getBranchId).containsExactlyInAnyOrder(null, BRANCH_A, BRANCH_B);
    }

    @Test
    void anotherBranchsProductCannotBePricedByABranchUser() {
        Branch b = new Branch();
        b.setId(BRANCH_B);
        product.setBranch(b);
        restrictTo(BRANCH_A);

        assertThatThrownBy(() -> service.upsert(List.of(new PriceRow(10L, 2L, BRANCH_A, new BigDecimal("70")))))
                .isInstanceOf(ResponseStatusException.class);
    }

    private static void restrictTo(long branchId) {
        BranchContextHolder.set(new BranchContextHolder.BranchContext(branchId, Set.of(branchId), false));
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
