package com.billbull.backend.config;

import com.billbull.backend.financials.chartofaccounts.CostCenter;
import com.billbull.backend.financials.chartofaccounts.CostCenterRepository;
import com.billbull.backend.financials.currency.Currency;
import com.billbull.backend.financials.currency.CurrencyRepository;
import com.billbull.backend.financials.paymentterms.PaymentTerms;
import com.billbull.backend.financials.paymentterms.PaymentTermsRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.settings.outlet.Outlet;
import com.billbull.backend.settings.outlet.OutletRepository;
import com.billbull.backend.financials.period.AccountingPeriod;
import com.billbull.backend.financials.period.AccountingPeriodRepository;
import com.billbull.backend.financials.period.FiscalYear;
import com.billbull.backend.financials.period.FiscalYearRepository;
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
    private final FiscalYearRepository fiscalYearRepo;
    private final CurrencyRepository currencyRepo;
    private final PaymentTermsRepository paymentTermsRepo;
    private final BranchRepository branchRepo;
    private final OutletRepository outletRepo;

    public FinancialsDefaultSeeder(
            TaxConfigurationRepository taxRepo,
            AccountingPeriodRepository periodRepo,
            CostCenterRepository costCenterRepo,
            FiscalYearRepository fiscalYearRepo,
            CurrencyRepository currencyRepo,
            PaymentTermsRepository paymentTermsRepo,
            BranchRepository branchRepo,
            OutletRepository outletRepo) {
        this.taxRepo = taxRepo;
        this.periodRepo = periodRepo;
        this.costCenterRepo = costCenterRepo;
        this.fiscalYearRepo = fiscalYearRepo;
        this.currencyRepo = currencyRepo;
        this.paymentTermsRepo = paymentTermsRepo;
        this.branchRepo = branchRepo;
        this.outletRepo = outletRepo;
    }

    @Override
    public void run(ApplicationArguments args) {
        seedTaxConfiguration();
        seedAccountingPeriods();
        seedDefaultCostCenter();
        seedFiscalYears();
        seedBaseCurrency();
        seedPaymentTerms();
        seedDefaultOutlets();
    }

    private void seedTaxConfiguration() {
        if (taxRepo.existsByTypeAndStatus("VAT", "Active")) return;

        TaxConfiguration vat = new TaxConfiguration();
        vat.setType("VAT");
        vat.setFrequency("Quarterly");
        vat.setRate("5");
        vat.setAccounts(List.of("1310", "2100"));
        vat.setStatus("Active");
        taxRepo.save(vat);

        System.out.println("[FinancialsDefaultSeeder] Seeded UAE VAT 5% tax configuration.");
    }

    private void seedAccountingPeriods() {
        int currentYear = Year.now().getValue();
        // Seed prev year, current year, and next year — idempotent per start date
        List<AccountingPeriod> toSave = new ArrayList<>();
        for (int year = currentYear - 1; year <= currentYear + 1; year++) {
            for (int month = 1; month <= 12; month++) {
                LocalDate start = LocalDate.of(year, month, 1);
                if (periodRepo.existsByStartDate(start)) continue;
                LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
                AccountingPeriod p = new AccountingPeriod();
                p.setPeriodName(start.getMonth().getDisplayName(
                        java.time.format.TextStyle.FULL, java.util.Locale.ENGLISH) + " " + year);
                p.setStartDate(start);
                p.setEndDate(end);
                p.setStatus(year < currentYear ? "Closed" : "Open");
                toSave.add(p);
            }
        }
        if (!toSave.isEmpty()) {
            periodRepo.saveAll(toSave);
            System.out.println("[FinancialsDefaultSeeder] Seeded " + toSave.size() + " new accounting period(s).");
        }
    }

    private void seedFiscalYears() {
        int currentYear = Year.now().getValue();
        // Seed one fiscal year per calendar year for prev, current, and next
        for (int year = currentYear - 1; year <= currentYear + 1; year++) {
            String code = "FY" + year;
            if (fiscalYearRepo.existsByCode(code)) continue;

            FiscalYear fy = new FiscalYear();
            fy.setCode(code);
            fy.setStartDate(LocalDate.of(year, 1, 1));
            fy.setEndDate(LocalDate.of(year, 12, 31));
            fy.setStatus(year < currentYear ? "Closed" : "Open");
            FiscalYear saved = fiscalYearRepo.save(fy);

            // Link existing periods that fall inside this fiscal year
            for (AccountingPeriod p : periodRepo.findByFiscalYearIdIsNull()) {
                if (!p.getStartDate().isBefore(saved.getStartDate())
                        && !p.getEndDate().isAfter(saved.getEndDate())) {
                    p.setFiscalYearId(saved.getId());
                    periodRepo.save(p);
                }
            }

            System.out.println("[FinancialsDefaultSeeder] Seeded fiscal year " + code + " (" + fy.getStatus() + ").");
        }
    }

    private void seedPaymentTerms() {
        record TermSeed(String code, String name, int netDays, double discountPct, int discountDays) {}
        List<TermSeed> seeds = List.of(
            new TermSeed("IMMEDIATE",    "Immediate / Cash on Delivery", 0,   0.0,  0),
            new TermSeed("NET_15",       "Net 15 Days",                  15,  0.0,  0),
            new TermSeed("NET_30",       "Net 30 Days",                  30,  0.0,  0),
            new TermSeed("NET_60",       "Net 60 Days",                  60,  0.0,  0),
            new TermSeed("2_10_NET_30",  "2% 10 Net 30",                 30,  2.0, 10)
        );
        for (TermSeed s : seeds) {
            if (paymentTermsRepo.existsByCode(s.code())) continue;
            PaymentTerms t = new PaymentTerms();
            t.setCode(s.code());
            t.setName(s.name());
            t.setNetDays(s.netDays());
            t.setEarlyPaymentDiscountPercent(new BigDecimal(String.valueOf(s.discountPct())));
            t.setEarlyPaymentDiscountDays(s.discountDays());
            paymentTermsRepo.save(t);
        }
        System.out.println("[FinancialsDefaultSeeder] Seeded payment terms.");
    }

    private void seedDefaultOutlets() {
        List<Branch> branches = branchRepo.findAll();
        int seeded = 0;
        for (Branch b : branches) {
            String code = "OL-" + (b.getCode() != null ? b.getCode() : b.getId());
            if (outletRepo.existsByCode(code)) continue;
            Outlet o = new Outlet();
            o.setCode(code);
            o.setName(b.getName() + " (Default Outlet)");
            o.setType("Retail");
            o.setBranchId(b.getId());
            outletRepo.save(o);
            seeded++;
        }
        if (seeded > 0) {
            System.out.println("[FinancialsDefaultSeeder] Seeded " + seeded + " default outlet(s).");
        }
    }

    private void seedBaseCurrency() {
        if (currencyRepo.existsById("AED")) return;
        Currency aed = new Currency();
        aed.setCode("AED");
        aed.setName("UAE Dirham");
        aed.setSymbol("AED");
        aed.setIsBase(true);
        aed.setIsActive(true);
        currencyRepo.save(aed);
        System.out.println("[FinancialsDefaultSeeder] Seeded base currency AED.");
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
