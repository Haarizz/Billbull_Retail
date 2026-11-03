package com.billbull.backend.sales.pricing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
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
import com.billbull.backend.inventory.product.ProductPriceChange;
import com.billbull.backend.inventory.product.ProductPriceChangeRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.pricing.CustomerProductPriceService.PriceRequest;
import com.billbull.backend.sales.pricing.CustomerProductPriceService.PriceResponse;
import com.billbull.backend.sales.pricing.CustomerProductPriceService.Status;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;

/**
 * Pricing Phase 2 — managing negotiated prices: create / update with audit, validation, duplicate
 * (overlapping) mapping prevention, activate / deactivate, discontinue and remove, and branch
 * scoping (branch rows need that branch; all-branches rows need all-branches access).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CustomerProductPriceServiceTest {

    static final long BRANCH_A = 1L;
    static final long BRANCH_B = 2L;
    static final LocalDate TODAY = LocalDate.of(2026, 11, 1);

    @Mock CustomerProductPriceRepository repository;
    @Mock CustomerRepository customerRepository;
    @Mock ProductRepository productRepository;
    @Mock BranchRepository branchRepository;
    @Mock ProductPriceChangeRepository priceChangeRepository;
    @Mock PricingResolutionService resolver;

    CustomerProductPriceService service;
    final List<CustomerProductPrice> rows = new ArrayList<>();
    long nextId = 1;
    Customer abc;
    Product productA;

    @BeforeEach
    void setUp() {
        service = new CustomerProductPriceService(repository, customerRepository, productRepository,
                branchRepository, priceChangeRepository, resolver);
        when(resolver.pricingDate(any())).thenAnswer(inv -> inv.getArgument(0) != null ? inv.getArgument(0) : TODAY);

        abc = new Customer();
        abc.setId(501L);
        abc.setCode("ABC");
        abc.setName("ABC Trading");
        when(customerRepository.findById(501L)).thenReturn(Optional.of(abc));
        when(customerRepository.findAllById(any())).thenReturn(List.of(abc));

        productA = new Product();
        productA.setId(10L);
        productA.setCode("A");
        productA.setName("Product A");
        productA.setActive(true);
        when(productRepository.findById(10L)).thenReturn(Optional.of(productA));
        when(productRepository.findAllById(any())).thenReturn(List.of(productA));
        when(branchRepository.existsById(anyLong())).thenReturn(true);
        Branch a = new Branch();
        a.setId(BRANCH_A);
        a.setName("Main");
        when(branchRepository.findAllById(any())).thenReturn(List.of(a));

        when(repository.saveAndFlush(any())).thenAnswer(inv -> {
            CustomerProductPrice r = inv.getArgument(0);
            if (r.getId() == null) r.setId(nextId++);
            if (!rows.contains(r)) rows.add(r);
            return r;
        });
        when(repository.findById(anyLong())).thenAnswer(inv ->
                rows.stream().filter(r -> r.getId().equals(inv.getArgument(0))).findFirst());
        when(repository.findByCustomerIdAndProductIdAndIsActiveTrue(anyLong(), anyLong())).thenAnswer(inv ->
                rows.stream().filter(r -> r.isActive() && r.getCustomerId().equals(inv.getArgument(0))
                        && r.getProductId().equals(inv.getArgument(1))).toList());
    }

    @AfterEach
    void clearContext() {
        BranchContextHolder.clear();
    }

    // ------------------------------------------------------------------ create / update

    @Test
    void createsANegotiatedPriceWithAudit() {
        PriceResponse saved = service.create(request(null, "25", TODAY, null));

        assertThat(saved.id()).isNotNull();
        assertThat(saved.price()).isEqualByComparingTo("25.00");
        assertThat(saved.customerCode()).isEqualTo("ABC");
        assertThat(saved.productCode()).isEqualTo("A");
        assertThat(saved.status()).isEqualTo(Status.CURRENT);
        assertThat(saved.branchId()).isNull();
        verify(repository).lockCustomer(501L);
        ArgumentCaptor<ProductPriceChange> audit = ArgumentCaptor.forClass(ProductPriceChange.class);
        verify(priceChangeRepository).save(audit.capture());
        assertThat(audit.getValue().getPriceLevel()).isEqualTo("C:ABC");
    }

    @Test
    void effectiveFromDefaultsToTheBusinessDay() {
        PriceResponse saved = service.create(request(null, "25", null, null));
        assertThat(saved.effectiveFrom()).isEqualTo(TODAY);
    }

    @Test
    void updatesThePriceAndDatesButNotTheCustomerOrProduct() {
        PriceResponse saved = service.create(request(null, "25", TODAY, null));

        PriceRequest change = request(null, "24.5", TODAY.minusDays(3), TODAY.plusDays(30));
        PriceResponse updated = service.update(saved.id(), change);
        assertThat(updated.price()).isEqualByComparingTo("24.50");
        assertThat(updated.effectiveTo()).isEqualTo(TODAY.plusDays(30));

        PriceRequest move = request(null, "24", TODAY, null);
        move.setCustomerId(999L);
        assertThatThrownBy(() -> service.update(saved.id(), move)).isInstanceOf(PricingException.class);
    }

    @Test
    void rejectsInvalidPricesAndDates() {
        assertThatThrownBy(() -> service.create(request(null, "0", TODAY, null))).isInstanceOf(PricingException.class);
        assertThatThrownBy(() -> service.create(request(null, "-5", TODAY, null))).isInstanceOf(PricingException.class);
        assertThatThrownBy(() -> service.create(request(null, null, TODAY, null))).isInstanceOf(PricingException.class);
        assertThatThrownBy(() -> service.create(request(null, "25", TODAY, TODAY.minusDays(1))))
                .isInstanceOf(PricingException.class);
        PriceRequest noCustomer = request(null, "25", TODAY, null);
        noCustomer.setCustomerId(null);
        assertThatThrownBy(() -> service.create(noCustomer)).isInstanceOf(PricingException.class);
        productA.setActive(false);
        assertThatThrownBy(() -> service.create(request(null, "25", TODAY, null))).isInstanceOf(PricingException.class);
    }

    // ------------------------------------------------------------------ duplicates

    @Test
    void overlappingLiveMappingForTheSameScopeIsRefused() {
        service.create(request(null, "25", TODAY, null));

        assertThatThrownBy(() -> service.create(request(null, "24", TODAY.plusDays(10), TODAY.plusDays(20))))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void nonOverlappingPeriodsAndOtherScopesAreAllowed() {
        service.create(request(null, "25", TODAY, TODAY.plusDays(30)));
        service.create(request(null, "24", TODAY.plusDays(31), null));     // next period
        service.create(request(BRANCH_A, "23", TODAY, null));               // branch scope is separate

        assertThat(rows).hasSize(3);
    }

    @Test
    void disabledMappingDoesNotBlockButCannotBeReEnabledIntoAnOverlap() {
        PriceResponse first = service.create(request(null, "25", TODAY, null));
        service.setEnabled(first.id(), false);
        service.create(request(null, "24", TODAY, null));

        assertThatThrownBy(() -> service.setEnabled(first.id(), true))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void overlapCheckCoversOpenEndedAndBoundedRanges() {
        assertThat(CustomerProductPriceService.overlaps(TODAY, null, TODAY.plusDays(5), TODAY.plusDays(6))).isTrue();
        assertThat(CustomerProductPriceService.overlaps(TODAY, TODAY.plusDays(4), TODAY.plusDays(5), null)).isFalse();
        assertThat(CustomerProductPriceService.overlaps(TODAY, TODAY.plusDays(5), TODAY.plusDays(5), null)).isTrue();
    }

    // ------------------------------------------------------------------ deactivate / discontinue / remove

    @Test
    void deactivateAndActivate() {
        PriceResponse saved = service.create(request(null, "25", TODAY, null));
        assertThat(service.setEnabled(saved.id(), false).status()).isEqualTo(Status.DISABLED);
        assertThat(service.setEnabled(saved.id(), true).status()).isEqualTo(Status.CURRENT);
    }

    @Test
    void discontinueEndsTheMappingYesterdayAndKeepsIt() {
        PriceResponse saved = service.create(request(null, "25", TODAY.minusDays(10), null));

        PriceResponse ended = service.discontinue(saved.id());

        assertThat(ended.effectiveTo()).isEqualTo(TODAY.minusDays(1));
        assertThat(ended.status()).isEqualTo(Status.EXPIRED);
        assertThat(rows).singleElement().satisfies(r -> assertThat(r.isActive()).isTrue());
    }

    @Test
    void discontinuingAMappingThatHasNotStartedDeactivatesIt() {
        PriceResponse saved = service.create(request(null, "25", TODAY.plusDays(3), null));
        assertThat(service.discontinue(saved.id()).status()).isEqualTo(Status.DISABLED);
    }

    @Test
    void removeIsASoftDelete() {
        PriceResponse saved = service.create(request(null, "25", TODAY, null));

        service.delete(saved.id());

        assertThat(rows).singleElement().satisfies(r -> assertThat(r.isActive()).isFalse());
        assertThatThrownBy(() -> service.get(saved.id()))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    // ------------------------------------------------------------------ branch access

    @Test
    void branchUserCannotSetAnAllBranchesPrice() {
        restrictTo(BRANCH_A);

        assertThatThrownBy(() -> service.create(request(null, "25", TODAY, null)))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void branchUserCanSetTheirOwnBranchPriceButNotAnotherBranches() {
        restrictTo(BRANCH_A);

        assertThat(service.create(request(BRANCH_A, "23", TODAY, null)).branchName()).isEqualTo("Main");
        assertThatThrownBy(() -> service.create(request(BRANCH_B, "22", TODAY, null)))
                .isInstanceOf(RuntimeException.class);
        assertThat(rows).hasSize(1);
    }

    @Test
    void branchUserCannotReadOrChangeAnotherBranchesPrice() {
        PriceResponse other = service.create(request(BRANCH_B, "22", TODAY, null));
        restrictTo(BRANCH_A);

        assertThatThrownBy(() -> service.get(other.id())).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> service.update(other.id(), request(BRANCH_B, "21", TODAY, null)))
                .isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> service.delete(other.id())).isInstanceOf(RuntimeException.class);
        assertThat(rows).singleElement().satisfies(r -> {
            assertThat(r.getPrice()).isEqualByComparingTo("22.00");
            assertThat(r.isActive()).isTrue();
        });
    }

    @Test
    void branchOwnedProductCannotBePricedForAnotherBranch() {
        Branch owner = new Branch();
        owner.setId(BRANCH_A);
        productA.setBranch(owner);

        assertThatThrownBy(() -> service.create(request(BRANCH_B, "22", TODAY, null)))
                .isInstanceOf(PricingException.class);
    }

    // ------------------------------------------------------------------ fixtures

    private static PriceRequest request(Long branchId, String price, LocalDate from, LocalDate to) {
        PriceRequest r = new PriceRequest();
        r.setCustomerId(501L);
        r.setProductId(10L);
        r.setBranchId(branchId);
        r.setPrice(price != null ? new BigDecimal(price) : null);
        r.setEffectiveFrom(from);
        r.setEffectiveTo(to);
        return r;
    }

    private static void restrictTo(long branchId) {
        BranchContextHolder.set(new BranchContextHolder.BranchContext(branchId, Set.of(branchId), false));
    }
}
