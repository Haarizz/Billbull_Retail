package com.billbull.backend.pos.printer;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "pos_printers", indexes = {
        @Index(name = "idx_pos_printer_branch", columnList = "branch_id"),
        @Index(name = "idx_pos_printer_terminal", columnList = "terminal_id"),
        @Index(name = "idx_pos_printer_type", columnList = "device_type"),
        @Index(name = "idx_pos_printer_status", columnList = "status")
})
public class PosPrinter extends BaseEntity {

    @Column(name = "device_code", nullable = false, length = 50, unique = true)
    private String deviceCode;

    /** Parent row in the shared device registry (pos.device.PosDevice). Nullable only for
     *  rows that predate the Device Manager (Phase A) — backfilled by V22 for existing data;
     *  always set by PosPrinterService for printers created from this point on. */
    @Column(name = "device_id")
    private Long deviceId;

    @Enumerated(EnumType.STRING)
    @Column(name = "device_type", nullable = false, length = 40)
    private PosPrinterType deviceType;

    @Column(name = "device_name", nullable = false, length = 120)
    private String deviceName;

    @Column(name = "model_name", length = 120)
    private String modelName;

    @Column(name = "branch_id", nullable = false)
    private Long branchId;

    @Column(name = "branch_name", length = 120)
    private String branchName;

    @Column(name = "terminal_id", length = 80)
    private String terminalId;

    @Column(name = "terminal_name", length = 120)
    private String terminalName;

    @Column(name = "counter_name", length = 120)
    private String counterName;

    @Enumerated(EnumType.STRING)
    @Column(name = "connection_type", nullable = false, length = 40)
    private PosPrinterConnectionType connectionType = PosPrinterConnectionType.WINDOWS_QUEUE;

    @Column(name = "system_printer_name", length = 200)
    private String systemPrinterName;

    @Column(name = "device_identifier", length = 200)
    private String deviceIdentifier;

    @Column(name = "ip_address", length = 100)
    private String ipAddress;

    @Column(name = "port_number")
    private Integer portNumber;

    @Column(name = "paper_size", length = 40)
    private String paperSize;

    @Column(name = "print_template", length = 80)
    private String printTemplate;

    @Column(name = "is_default_printer", nullable = false)
    private boolean defaultPrinter;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private PosPrinterStatus status = PosPrinterStatus.ACTIVE;

    @Enumerated(EnumType.STRING)
    @Column(name = "runtime_status", nullable = false, length = 20)
    private PosPrinterRuntimeStatus runtimeStatus = PosPrinterRuntimeStatus.UNKNOWN;

    @Column(name = "last_test_result", length = 500)
    private String lastTestResult;

    @Column(name = "last_tested_at")
    private LocalDateTime lastTestedAt;

    @Column(name = "last_seen_at")
    private LocalDateTime lastSeenAt;

    @Column(name = "notes", length = 500)
    private String notes;

    public String getDeviceCode() {
        return deviceCode;
    }

    public void setDeviceCode(String deviceCode) {
        this.deviceCode = deviceCode;
    }

    public Long getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(Long deviceId) {
        this.deviceId = deviceId;
    }

    public PosPrinterType getDeviceType() {
        return deviceType;
    }

    public void setDeviceType(PosPrinterType deviceType) {
        this.deviceType = deviceType;
    }

    public String getDeviceName() {
        return deviceName;
    }

    public void setDeviceName(String deviceName) {
        this.deviceName = deviceName;
    }

    public String getModelName() {
        return modelName;
    }

    public void setModelName(String modelName) {
        this.modelName = modelName;
    }

    public Long getBranchId() {
        return branchId;
    }

    public void setBranchId(Long branchId) {
        this.branchId = branchId;
    }

    public String getBranchName() {
        return branchName;
    }

    public void setBranchName(String branchName) {
        this.branchName = branchName;
    }

    public String getTerminalId() {
        return terminalId;
    }

    public void setTerminalId(String terminalId) {
        this.terminalId = terminalId;
    }

    public String getTerminalName() {
        return terminalName;
    }

    public void setTerminalName(String terminalName) {
        this.terminalName = terminalName;
    }

    public String getCounterName() {
        return counterName;
    }

    public void setCounterName(String counterName) {
        this.counterName = counterName;
    }

    public PosPrinterConnectionType getConnectionType() {
        return connectionType;
    }

    public void setConnectionType(PosPrinterConnectionType connectionType) {
        this.connectionType = connectionType;
    }

    public String getSystemPrinterName() {
        return systemPrinterName;
    }

    public void setSystemPrinterName(String systemPrinterName) {
        this.systemPrinterName = systemPrinterName;
    }

    public String getDeviceIdentifier() {
        return deviceIdentifier;
    }

    public void setDeviceIdentifier(String deviceIdentifier) {
        this.deviceIdentifier = deviceIdentifier;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public void setIpAddress(String ipAddress) {
        this.ipAddress = ipAddress;
    }

    public Integer getPortNumber() {
        return portNumber;
    }

    public void setPortNumber(Integer portNumber) {
        this.portNumber = portNumber;
    }

    public String getPaperSize() {
        return paperSize;
    }

    public void setPaperSize(String paperSize) {
        this.paperSize = paperSize;
    }

    public String getPrintTemplate() {
        return printTemplate;
    }

    public void setPrintTemplate(String printTemplate) {
        this.printTemplate = printTemplate;
    }

    public boolean isDefaultPrinter() {
        return defaultPrinter;
    }

    public void setDefaultPrinter(boolean defaultPrinter) {
        this.defaultPrinter = defaultPrinter;
    }

    public PosPrinterStatus getStatus() {
        return status;
    }

    public void setStatus(PosPrinterStatus status) {
        this.status = status;
    }

    public PosPrinterRuntimeStatus getRuntimeStatus() {
        return runtimeStatus;
    }

    public void setRuntimeStatus(PosPrinterRuntimeStatus runtimeStatus) {
        this.runtimeStatus = runtimeStatus;
    }

    public String getLastTestResult() {
        return lastTestResult;
    }

    public void setLastTestResult(String lastTestResult) {
        this.lastTestResult = lastTestResult;
    }

    public LocalDateTime getLastTestedAt() {
        return lastTestedAt;
    }

    public void setLastTestedAt(LocalDateTime lastTestedAt) {
        this.lastTestedAt = lastTestedAt;
    }

    public LocalDateTime getLastSeenAt() {
        return lastSeenAt;
    }

    public void setLastSeenAt(LocalDateTime lastSeenAt) {
        this.lastSeenAt = lastSeenAt;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }
}
