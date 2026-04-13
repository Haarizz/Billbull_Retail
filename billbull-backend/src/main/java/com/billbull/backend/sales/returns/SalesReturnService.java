package com.billbull.backend.sales.returns;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class SalesReturnService {

    @Autowired
    private SalesReturnRepository salesReturnRepository;

    @Autowired
    private PostingEngineService postingEngineService;

    @Transactional(readOnly = true)
    public List<SalesReturn> getAllReturns() {
        return salesReturnRepository.findAll();
    }

    public SalesReturn getReturnById(Long id) {
        return salesReturnRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Sales Return not found with ID: " + id));
    }

    @Transactional
    public SalesReturn saveReturn(SalesReturn salesReturn) {
        if (salesReturn.getId() != null) {
            SalesReturn existing = getReturnById(salesReturn.getId());
            if (existing.getStatus() == SalesReturnStatus.APPROVED) {
                throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "Approved returns cannot be modified. Create a reversal instead.");
            }
        }

        // Generate number if new
        if (salesReturn.getId() == null
                && (salesReturn.getReturnNumber() == null || salesReturn.getReturnNumber().isEmpty())) {
            salesReturn.setReturnNumber(generateReturnNumber());
        }

        // Default to Draft if no status
        if (salesReturn.getStatus() == null) {
            salesReturn.setStatus(SalesReturnStatus.DRAFT);
        }

        // Set date if null
        if (salesReturn.getReturnDate() == null) {
            salesReturn.setReturnDate(LocalDate.now());
        }

        // Link items back to parent
        if (salesReturn.getItems() != null) {
            salesReturn.getItems().forEach(item -> item.setSalesReturn(salesReturn));
        }

        return salesReturnRepository.save(salesReturn);
    }

    @Transactional
    public void deleteReturn(Long id) {
        SalesReturn existing = getReturnById(id);
        if (existing.getStatus() == SalesReturnStatus.APPROVED) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Approved returns cannot be deleted.");
        }
        salesReturnRepository.deleteById(id);
    }

    public String generateReturnNumber() {
        String year = String.valueOf(LocalDate.now().getYear());
        String prefix = "SR-" + year + "-";

        Optional<SalesReturn> lastReturn = salesReturnRepository.findTopByOrderByReturnNumberDesc();
        int lastNum = 0;

        if (lastReturn.isPresent()) {
            String lastReturnNum = lastReturn.get().getReturnNumber();
            if (lastReturnNum != null && lastReturnNum.startsWith(prefix)) {
                try {
                    String[] parts = lastReturnNum.split("-");
                    if (parts.length >= 3) {
                        lastNum = Integer.parseInt(parts[2]);
                    }
                } catch (NumberFormatException e) {
                    // fall back
                }
            }
        }

        return prefix + String.format("%04d", lastNum + 1);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getReturnStats() {
        Map<String, Object> stats = new HashMap<>();

        LocalDate today = LocalDate.now();
        YearMonth currentMonth = YearMonth.now();
        LocalDate monthStart = currentMonth.atDay(1);
        LocalDate monthEnd = currentMonth.atEndOfMonth();

        Double todayReturns = salesReturnRepository.getTotalReturnsForDate(today);
        Double monthReturns = salesReturnRepository.getTotalReturnsBetweenDates(monthStart, monthEnd);
        Double totalApproved = salesReturnRepository.getTotalApprovedReturns();
        long totalCount = salesReturnRepository.count();

        stats.put("todayReturns", todayReturns != null ? todayReturns : 0.0);
        stats.put("thisMonthReturns", monthReturns != null ? monthReturns : 0.0);
        stats.put("totalApprovedReturns", totalApproved != null ? totalApproved : 0.0);
        stats.put("totalTransactions", totalCount);

        return stats;
    }

    @Transactional
    public SalesReturn updateStatus(Long id, SalesReturnStatus status) {
        SalesReturn salesReturn = getReturnById(id);

        if (salesReturn.getStatus() == SalesReturnStatus.APPROVED) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Approved returns cannot be modified.");
        }

        salesReturn.setStatus(status);
        SalesReturn saved = salesReturnRepository.save(salesReturn);

        if (status == SalesReturnStatus.APPROVED) {
            java.math.BigDecimal costOfGoodsReturned = java.math.BigDecimal.ZERO;
            if (saved.getItems() != null) {
                for (com.billbull.backend.sales.returns.SalesReturnItem item : saved.getItems()) {
                    double itemPrice = item.getPrice() != null ? item.getPrice() : 0.0;
                    double itemCost = itemPrice * 0.7; // Estimated cost fallback
                    int qty = item.getReturnQty() != null ? item.getReturnQty() : 0;
                    costOfGoodsReturned = costOfGoodsReturned.add(java.math.BigDecimal.valueOf(itemCost * qty));
                }
            }
            postingEngineService.createJournalFromSalesReturn(saved, costOfGoodsReturned);
        }
        return saved;
    }
}
