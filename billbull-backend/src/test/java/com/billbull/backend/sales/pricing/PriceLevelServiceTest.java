package com.billbull.backend.sales.pricing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.pricing.PriceLevelService.PriceLevelRequest;
import com.billbull.backend.sales.pricing.PriceLevelService.PriceLevelResponse;

/** Pricing Phase 1 — creating, renaming, activating and deactivating named price levels. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PriceLevelServiceTest {

    @Mock PriceLevelRepository repository;
    @Mock ProductLevelPriceRepository levelPriceRepository;
    @Mock CustomerRepository customerRepository;

    PriceLevelService service;
    final List<PriceLevel> store = new ArrayList<>();
    long nextId = 100;

    @BeforeEach
    void setUp() {
        service = new PriceLevelService(repository, levelPriceRepository, customerRepository);
        when(repository.findAllByOrderBySortOrderAscNameAsc()).thenAnswer(inv -> List.copyOf(store));
        when(repository.findById(anyLong())).thenAnswer(inv ->
                store.stream().filter(l -> l.getId().equals(inv.getArgument(0))).findFirst());
        when(repository.findFirstByNameIgnoreCase(anyString())).thenAnswer(inv ->
                store.stream().filter(l -> l.getName().equalsIgnoreCase(inv.getArgument(0))).findFirst());
        when(repository.findFirstByCodeIgnoreCase(anyString())).thenAnswer(inv ->
                store.stream().filter(l -> l.getCode().equalsIgnoreCase(inv.getArgument(0))).findFirst());
        when(repository.save(any(PriceLevel.class))).thenAnswer(inv -> {
            PriceLevel l = inv.getArgument(0);
            if (l.getId() == null) {
                l.setId(nextId++);
                store.add(l);
            }
            return l;
        });
        existing(1L, "RETAIL", "Retail", true);
    }

    @Test
    void createsACustomNamedLevelWithADerivedCode() {
        PriceLevelResponse created = service.create(request(null, "  Trade Partners  "));

        assertThat(created.name()).isEqualTo("Trade Partners");
        assertThat(created.code()).isEqualTo("TRADE_PARTNERS");
        assertThat(created.active()).isTrue();
        assertThat(created.systemDefault()).isFalse();
    }

    @Test
    void derivedCodeCollisionGetsASuffixButATypedCollisionIsRefused() {
        existing(2L, "VIP", "Gold", false);

        assertThat(service.create(request(null, "VIP")).code()).isEqualTo("VIP_2");
        assertThatThrownBy(() -> service.create(request("vip", "Platinum")))
                .isInstanceOf(PricingException.class).hasMessageContaining("already used");
    }

    @Test
    void duplicateNamesAreRefusedCaseInsensitively() {
        existing(2L, "WHOLESALE", "Wholesale", false);
        assertThatThrownBy(() -> service.create(request(null, "wholesale")))
                .isInstanceOf(PricingException.class).hasMessageContaining("already exists");
    }

    @Test
    void blankAndOverlongNamesAreRefused() {
        assertThatThrownBy(() -> service.create(request(null, "  "))).isInstanceOf(PricingException.class);
        assertThatThrownBy(() -> service.create(request(null, "x".repeat(101)))).isInstanceOf(PricingException.class);
    }

    @Test
    void renamingKeepsCustomerLabelsInStep() {
        PriceLevel level = existing(2L, "WHOLESALE", "Wholesale", false);

        PriceLevelResponse renamed = service.update(2L, request(null, "Trade"));

        assertThat(renamed.name()).isEqualTo("Trade");
        assertThat(level.getCode()).isEqualTo("WHOLESALE");
        verify(customerRepository).renamePriceList(2L, "Trade");
    }

    @Test
    void updateWithoutRenameDoesNotTouchCustomers() {
        existing(2L, "WHOLESALE", "Wholesale", false);
        PriceLevelRequest req = request(null, "Wholesale");
        req.setDescription("Trade buyers");

        service.update(2L, req);

        verify(customerRepository, never()).renamePriceList(anyLong(), anyString());
    }

    @Test
    void renamingIntoAnotherLevelsNameIsRefused() {
        existing(2L, "WHOLESALE", "Wholesale", false);
        existing(3L, "VIP", "VIP", false);
        assertThatThrownBy(() -> service.update(3L, request(null, "WHOLESALE")))
                .isInstanceOf(PricingException.class);
    }

    @Test
    void levelsCanBeDeactivatedAndReactivated() {
        existing(2L, "WHOLESALE", "Wholesale", false);

        assertThat(service.setActive(2L, false).active()).isFalse();
        assertThat(service.list(false)).extracting(PriceLevelResponse::name).containsExactly("Retail");
        assertThat(service.list(true)).extracting(PriceLevelResponse::name).contains("Wholesale");
        assertThat(service.setActive(2L, true).active()).isTrue();
    }

    @Test
    void theDefaultLevelCannotBeDeactivatedButCanBeRenamed() {
        assertThatThrownBy(() -> service.setActive(1L, false))
                .isInstanceOf(PricingException.class).hasMessageContaining("cannot be deactivated");
        assertThat(service.update(1L, request(null, "Standard")).name()).isEqualTo("Standard");
    }

    @Test
    void unknownLevelIsA400() {
        when(repository.findById(999L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.update(999L, request(null, "X"))).isInstanceOf(PricingException.class);
    }

    private PriceLevel existing(long id, String code, String name, boolean systemDefault) {
        PriceLevel l = new PriceLevel();
        l.setId(id);
        l.setCode(code);
        l.setName(name);
        l.setSystemDefault(systemDefault);
        l.setActive(true);
        store.add(l);
        return l;
    }

    private static PriceLevelRequest request(String code, String name) {
        PriceLevelRequest r = new PriceLevelRequest();
        r.setCode(code);
        r.setName(name);
        return r;
    }
}
