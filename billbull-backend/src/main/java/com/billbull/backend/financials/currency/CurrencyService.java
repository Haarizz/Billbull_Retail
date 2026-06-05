package com.billbull.backend.financials.currency;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CurrencyService {

    private final CurrencyRepository currencyRepo;
    private final ExchangeRateRepository fxRepo;

    public CurrencyService(CurrencyRepository currencyRepo, ExchangeRateRepository fxRepo) {
        this.currencyRepo = currencyRepo;
        this.fxRepo       = fxRepo;
    }

    public List<Currency> getActiveCurrencies() {
        return currencyRepo.findByIsActiveTrue();
    }

    public Optional<Currency> getBaseCurrency() {
        return currencyRepo.findByIsBaseTrue();
    }

    @Transactional
    public Currency save(Currency currency) {
        return currencyRepo.save(currency);
    }

    @Transactional
    public ExchangeRate saveRate(ExchangeRate rate) {
        return fxRepo.save(rate);
    }

    public List<ExchangeRate> getAllRates() {
        return fxRepo.findAll();
    }

    /**
     * Returns the exchange rate (from → to) effective on or before date.
     * If from == to, returns 1. Returns empty if no rate found.
     */
    public Optional<BigDecimal> getRate(String from, String to, LocalDate date) {
        if (from.equals(to)) return Optional.of(BigDecimal.ONE);
        return fxRepo.findLatestOnOrBefore(from, to, date).map(ExchangeRate::getRate);
    }
}
