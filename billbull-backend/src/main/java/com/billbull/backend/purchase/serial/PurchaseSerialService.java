package com.billbull.backend.purchase.serial;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.billbull.backend.inventory.serial.SerialMaster;
import com.billbull.backend.inventory.serial.SerialMasterRepository;
import com.billbull.backend.inventory.serial.SerialStatus;

@Service
public class PurchaseSerialService {

    private final SerialMasterRepository serialMasterRepository;

    public PurchaseSerialService(SerialMasterRepository serialMasterRepository) {
        this.serialMasterRepository = serialMasterRepository;
    }

    public String normalizeSerialNumber(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty() || "-".equals(trimmed)) {
            return null;
        }
        return trimmed.toUpperCase(Locale.ROOT);
    }

    public List<PurchaseSerialDraft> normalizeDrafts(List<PurchaseSerialDraft> drafts) {
        List<PurchaseSerialDraft> normalized = new ArrayList<>();
        if (drafts == null) {
            return normalized;
        }
        for (PurchaseSerialDraft row : drafts) {
            if (row == null) {
                continue;
            }
            String serialNumber = normalizeSerialNumber(row.getSerialNumber());
            if (serialNumber == null) {
                continue;
            }
            PurchaseSerialDraft cleaned = new PurchaseSerialDraft();
            cleaned.setId(row.getId());
            cleaned.setSerialNumber(serialNumber);
            cleaned.setManufacturingDate(row.getManufacturingDate());
            cleaned.setExpiryDate(row.getExpiryDate());
            normalized.add(cleaned);
        }
        return normalized;
    }

    public void assertNoDuplicateSerials(Collection<String> serialNumbers, String context) {
        Set<String> seen = new HashSet<>();
        for (String raw : serialNumbers) {
            String normalized = normalizeSerialNumber(raw);
            if (normalized == null) {
                continue;
            }
            if (!seen.add(normalized)) {
                throw new IllegalArgumentException("Duplicate serial number '" + normalized + "' in " + context);
            }
        }
    }

    public void assertSerialsNotAlreadyPosted(Collection<String> serialNumbers, String context) {
        List<String> normalized = serialNumbers.stream()
                .map(this::normalizeSerialNumber)
                .filter(value -> value != null)
                .distinct()
                .toList();
        if (!normalized.isEmpty() && serialMasterRepository.existsBySerialNumberIn(normalized)) {
            throw new IllegalStateException("One or more serial numbers already exist in stock for " + context);
        }
    }

    public SerialMaster newSerialMaster(
            String serialNumber,
            String productCode,
            String productName,
            String purchaseReference,
            String warehouseCode,
            String branchCode) {
        SerialMaster serial = new SerialMaster();
        serial.setSerialNumber(normalizeSerialNumber(serialNumber));
        serial.setProductCode(productCode);
        serial.setProductName(productName);
        serial.setPurchaseReference(purchaseReference);
        serial.setWarehouseCode(warehouseCode);
        serial.setBranchCode(branchCode);
        serial.setStatus(SerialStatus.AVAILABLE);
        return serial;
    }
}
