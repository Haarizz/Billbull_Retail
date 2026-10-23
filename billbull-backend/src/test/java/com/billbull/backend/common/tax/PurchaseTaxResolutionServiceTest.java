package com.billbull.backend.common.tax;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductTax;
import com.billbull.backend.inventory.product.ProductTaxRepository;
import com.billbull.backend.settings.branch.BranchTaxConfiguration;
import com.billbull.backend.settings.branch.BranchTaxConfigurationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PurchaseTaxResolutionServiceTest {

    private static final Long BRANCH_ID = 7L;

    @Mock private ProductTaxRepository productTaxRepository;
    @Mock private BranchTaxConfigurationService branchTaxConfigurationService;

    private PurchaseTaxResolutionService service;

    @BeforeEach
    void setUp() {
        service = new PurchaseTaxResolutionService(
                new BranchTaxResolutionService(productTaxRepository, branchTaxConfigurationService));
    }

    @Test
    void productPurchaseTaxWinsOverBranchDefault() {
        lenient().when(branchTaxConfigurationService.getForBranch(BRANCH_ID)).thenReturn(config(5.0, true));

        assertThat(service.resolvePurchaseTaxRateForProduct(product(new BigDecimal("15")), BRANCH_ID))
                .isEqualByComparingTo("15");
    }

    @Test
    void explicitZeroProductPurchaseTaxIsNotOverriddenByBranchDefault() {
        lenient().when(branchTaxConfigurationService.getForBranch(BRANCH_ID)).thenReturn(config(5.0, true));

        assertThat(service.resolvePurchaseTaxRateForProduct(product(BigDecimal.ZERO), BRANCH_ID))
                .isEqualByComparingTo("0");
        verify(branchTaxConfigurationService, never()).getForBranch(BRANCH_ID);
    }

    @Test
    void unsetProductPurchaseTaxFallsBackToBranchDefault() {
        when(branchTaxConfigurationService.getForBranch(BRANCH_ID)).thenReturn(config(5.0, true));

        assertThat(service.resolvePurchaseTaxRateForProduct(product(null), BRANCH_ID))
                .isEqualByComparingTo("5");
    }

    @Test
    void productWithoutTaxRowFallsBackToBranchDefault() {
        when(branchTaxConfigurationService.getForBranch(BRANCH_ID)).thenReturn(config(5.0, true));

        assertThat(service.resolvePurchaseTaxRateForProduct(new Product(), BRANCH_ID))
                .isEqualByComparingTo("5");
    }

    @Test
    void unconfiguredBranchDefaultResolvesToZero() {
        when(branchTaxConfigurationService.getForBranch(BRANCH_ID)).thenReturn(config(null, true));

        assertThat(service.resolvePurchaseTaxRateForProduct(product(null), BRANCH_ID))
                .isEqualByComparingTo("0");
    }

    @Test
    void branchTaxEnabledSwitchDoesNotZeroPurchaseDefault() {
        when(branchTaxConfigurationService.getForBranch(BRANCH_ID)).thenReturn(config(5.0, false));

        assertThat(service.resolvePurchaseTaxRateForProduct(product(null), BRANCH_ID))
                .isEqualByComparingTo("5");
    }

    @Test
    void nullBranchUsesActiveBranchConfiguration() {
        when(branchTaxConfigurationService.getForCurrentBranch()).thenReturn(config(12.5, true));

        assertThat(service.resolvePurchaseTaxRate(null, null)).isEqualByComparingTo("12.5");
    }

    private static BranchTaxConfiguration config(Double purchaseDefault, boolean taxEnabled) {
        BranchTaxConfiguration config = new BranchTaxConfiguration();
        config.setBranchId(BRANCH_ID);
        config.setTaxEnabled(taxEnabled);
        config.setBranchDefaultVatRate(5.0);
        config.setBranchDefaultPurchaseTaxRate(purchaseDefault);
        return config;
    }

    private static Product product(BigDecimal purchaseTax) {
        ProductTax tax = new ProductTax();
        tax.setPurchaseTax(purchaseTax);
        Product product = new Product();
        product.setTax(tax);
        return product;
    }
}
