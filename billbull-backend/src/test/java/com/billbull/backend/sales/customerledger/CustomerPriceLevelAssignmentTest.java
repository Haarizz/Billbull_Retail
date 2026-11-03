package com.billbull.backend.sales.customerledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.sales.pricing.PriceLevel;
import com.billbull.backend.sales.pricing.PriceLevelRepository;

/** Pricing Phase 1 — assigning a default price level to a customer. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CustomerPriceLevelAssignmentTest {

    @Mock PriceLevelRepository priceLevelRepository;
    CustomerService service;
    PriceLevel wholesale;
    PriceLevel vip;

    @BeforeEach
    void setUp() {
        service = new CustomerService();
        ReflectionTestUtils.setField(service, "priceLevelRepository", priceLevelRepository);
        wholesale = level(2L, "Wholesale", true);
        vip = level(3L, "VIP", true);
    }

    @Test
    void assigningALevelSetsTheLegacyLabel() {
        Customer c = customer(2L, "General");
        service.applyPriceLevel(c, null);
        assertThat(c.getPriceList()).isEqualTo("Wholesale");
    }

    @Test
    void changingLevelUpdatesTheLabel() {
        Customer c = customer(3L, "Wholesale");
        service.applyPriceLevel(c, 2L);
        assertThat(c.getPriceList()).isEqualTo("VIP");
    }

    @Test
    void anInactiveLevelCannotBeNewlyAssigned() {
        vip.setActive(false);
        assertThatThrownBy(() -> service.applyPriceLevel(customer(3L, null), 2L))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("inactive");
    }

    @Test
    void aCustomerAlreadyOnALevelThatWasDeactivatedCanStillBeSaved() {
        vip.setActive(false);
        Customer c = customer(3L, "VIP");
        service.applyPriceLevel(c, 3L);
        assertThat(c.getPriceLevelId()).isEqualTo(3L);
    }

    @Test
    void unknownLevelIsRefused() {
        assertThatThrownBy(() -> service.applyPriceLevel(customer(99L, null), null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void clearingTheLevelClearsALabelThatWasJustItsName() {
        Customer c = customer(null, "Wholesale");
        service.applyPriceLevel(c, 2L);
        assertThat(c.getPriceList()).isNull();
    }

    @Test
    void clearingTheLevelKeepsAnUnrelatedLegacyLabel() {
        Customer c = customer(null, "Contract-2019");
        service.applyPriceLevel(c, 2L);
        assertThat(c.getPriceList()).isEqualTo("Contract-2019");
    }

    private Customer customer(Long levelId, String priceList) {
        Customer c = new Customer();
        c.setPriceLevelId(levelId);
        c.setPriceList(priceList);
        return c;
    }

    private PriceLevel level(long id, String name, boolean active) {
        PriceLevel l = new PriceLevel();
        l.setId(id);
        l.setName(name);
        l.setCode(name.toUpperCase());
        l.setActive(active);
        when(priceLevelRepository.findById(id)).thenReturn(Optional.of(l));
        return l;
    }
}
