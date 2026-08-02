package com.billbull.backend.pos.session;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Lightweight row for {@code GET /api/pos/sessions/history} — intentionally not the
 *  full {@link PosSession} entity, to keep the list payload light for date-range browsing. */
public class PosSessionHistoryItem {

    private Long id;
    private String terminalId;
    private String terminalName;
    private String counterName;
    private String openedBy;
    private LocalDateTime openedAt;
    private LocalDateTime closedAt;
    private String status;
    private BigDecimal totalSales;
    private Integer invoiceCount;

    public PosSessionHistoryItem() {}

    public PosSessionHistoryItem(Long id, String terminalId, String terminalName, String counterName,
                                  String openedBy, LocalDateTime openedAt, LocalDateTime closedAt,
                                  String status, BigDecimal totalSales, Integer invoiceCount) {
        this.id = id;
        this.terminalId = terminalId;
        this.terminalName = terminalName;
        this.counterName = counterName;
        this.openedBy = openedBy;
        this.openedAt = openedAt;
        this.closedAt = closedAt;
        this.status = status;
        this.totalSales = totalSales;
        this.invoiceCount = invoiceCount;
    }

    public Long getId() { return id; }
    public String getTerminalId() { return terminalId; }
    public String getTerminalName() { return terminalName; }
    public String getCounterName() { return counterName; }
    public String getOpenedBy() { return openedBy; }
    public LocalDateTime getOpenedAt() { return openedAt; }
    public LocalDateTime getClosedAt() { return closedAt; }
    public String getStatus() { return status; }
    public BigDecimal getTotalSales() { return totalSales; }
    public Integer getInvoiceCount() { return invoiceCount; }
}
