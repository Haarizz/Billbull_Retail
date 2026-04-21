package com.billbull.backend.config;

import com.billbull.backend.financials.chartofaccounts.CostCenter;
import com.billbull.backend.financials.chartofaccounts.CostCenterRepository;
import com.billbull.backend.financials.period.AccountingPeriod;
import com.billbull.backend.financials.period.AccountingPeriodRepository;
import com.billbull.backend.financials.tax.TaxConfiguration;
import com.billbull.backend.financials.tax.TaxConfigurationRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.Year;
import java.util.ArrayList;
import java.util.List;

/**
 * Seeds default financial configuration on every startup — idempotent.
 * Seeds: UAE VAT 5% tax config, monthly accounting periods, default cost center.
 * Runs after SystemAccountSeeder (Order 2).
 */
@Component
@Order(2)
public class FinancialsDefaultSeeder implements ApplicationRunner {

    private final TaxConfigurationRepository taxRepo;
    private final AccountingPeriodRepository periodRepo;
    private final CostCenterRepository costCenterRepo;

    public FinancialsDefaultSeeder(
            TaxConfigurationRepository taxRepo,
            AccountingPeriodRepository periodRepo,
            CostCenterRepository costCenterRepo) {
        this.taxRepo = taxRepo;
        this.periodRepo = periodRepo;
        this.costCenterRepo = costCenterRepo;
    }

    @Override
    public void run(ApplicationArguments args) {
        seedTaxConfiguration();
        seedAccountingPeriods();
        seedDefaultCostCenter();
    }

    private void seedTaxConfiguration() {
        if (taxRepo.count() > 0) return;

        TaxConfiguration vat = new TaxConfiguration();
        vat.setType("VAT");
        vat.setFrequency("Quarterly");
        vat.setRate("5");
        vat.setAccounts(List.of("1130", "2102"));
        vat.setStatus("Active");
        taxRepo.save(vat);

        System.out.println("[FinancialsDefaultSeeder] Seeded UAE VAT 5% tax configuration.");
    }

    private void seedAccountingPeriods() {
        if (periodRepo.count() > 0) return;

        int currentYear = Year.now().getValue();
        // Seed previous year, current year, and next year
        List<AccountingPeriod> periods = new ArrayList<>();
        for (int year = currentYear - 1; year <= currentYear + 1; year++) {
            for (int month = 1; month <= 12; month++) {
                LocalDate start = LocalDate.of(year, month, 1);
                LocalDate end = start.withDayOfMonth(start.lengthOfMonth());

                AccountingPeriod p = new AccountingPeriod();
                p.setPeriodName(start.getMonth().getDisplayName(
                        java.time.format.TextStyle.FULL, java.util.Locale.ENGLISH) + " " + year);
                p.setStartDate(start);
                p.setEndDate(end);
                // Close all periods in prior years; open current and future
                p.setStatus(year < currentYear ? "Closed" : "Open");
                periods.add(p);
            }
        }
        periodRepo.saveAll(periods);

        System.out.println("[FinancialsDefaultSeeder] Seeded " + periods.size() + " accounting periods (" +
                (currentYear - 1) + "–" + (currentYear + 1) + ").");
    }

    private void seedDefaultCostCenter() {
        if (costCenterRepo.findByCode("CC-001") != null) return;

        CostCenter cc = new CostCenter();
        cc.setId("cc-default");
        cc.setCode("CC-001");
        cc.setName("General / Head Office");
        cc.setBranch("Head Office");
        cc.setBudget(BigDecimal.ZERO);
        cc.setSpent(BigDecimal.ZERO);
        cc.setDescription("Default cost center for general operations");
        cc.setStatus("active");
        costCenterRepo.save(cc);

        System.out.println("[FinancialsDefaultSeeder] Seeded default cost center CC-001.");
    }
}
