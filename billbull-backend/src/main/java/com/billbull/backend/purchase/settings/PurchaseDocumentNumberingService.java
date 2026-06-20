package com.billbull.backend.purchase.settings;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.purchase.grn.GrnRepository;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.purchase.lpo.LpoRepository;
import com.billbull.backend.purchase.payment.PaymentVoucherRepository;

@Service
public class PurchaseDocumentNumberingService {

    private static final int MIN_NEXT_NUMBER = 1;

    private final PurchaseDocumentNumberSettingRepository settingRepository;
    private final LpoRepository lpoRepository;
    private final GrnRepository grnRepository;
    private final PurchaseInvoiceRepository purchaseInvoiceRepository;
    private final PaymentVoucherRepository paymentVoucherRepository;

    public PurchaseDocumentNumberingService(
            PurchaseDocumentNumberSettingRepository settingRepository,
            LpoRepository lpoRepository,
            GrnRepository grnRepository,
            PurchaseInvoiceRepository purchaseInvoiceRepository,
            PaymentVoucherRepository paymentVoucherRepository) {
        this.settingRepository = settingRepository;
        this.lpoRepository = lpoRepository;
        this.grnRepository = grnRepository;
        this.purchaseInvoiceRepository = purchaseInvoiceRepository;
        this.paymentVoucherRepository = paymentVoucherRepository;
    }

    @Transactional
    public List<PurchaseDocumentNumberSetting> getAllSettingsWithPreview() {
        return Arrays.stream(PurchaseDocumentType.values())
                .map(this::getSettingWithPreview)
                .sorted(Comparator.comparingInt(setting -> setting.getDocumentType().ordinal()))
                .toList();
    }

    @Transactional
    public List<PurchaseDocumentNumberSetting> saveSettings(List<PurchaseDocumentNumberSetting> incomingSettings) {
        if (incomingSettings != null) {
            for (PurchaseDocumentNumberSetting incoming : incomingSettings) {
                if (incoming == null || incoming.getDocumentType() == null) {
                    continue;
                }

                PurchaseDocumentNumberSetting saved = ensureSetting(incoming.getDocumentType());
                saved.setLabel(saved.getDocumentType().getLabel());
                saved.setAutoNumberingEnabled(incoming.isAutoNumberingEnabled());
                saved.setPrefix(normalizePrefix(incoming.getPrefix(), saved.getDocumentType()));
                saved.setNextNumber(normalizeNextNumber(incoming.getNextNumber()));
                settingRepository.save(saved);
            }
        }

        return getAllSettingsWithPreview();
    }

    @Transactional(readOnly = true)
    public boolean isAutoNumberingEnabled(PurchaseDocumentType documentType) {
        return settingRepository.findById(documentType)
                .map(PurchaseDocumentNumberSetting::isAutoNumberingEnabled)
                .orElse(true);
    }

    @Transactional
    public PurchaseDocumentNumberSetting getSettingWithPreview(PurchaseDocumentType documentType) {
        PurchaseDocumentNumberSetting setting = ensureSetting(documentType);
        setting.setPreview(buildNumber(setting, nextSafeSequence(setting)));
        return setting;
    }

    @Transactional
    public String preview(PurchaseDocumentType documentType) {
        return getSettingWithPreview(documentType).getPreview();
    }

    @Transactional
    public String resolveNumberForCreate(PurchaseDocumentType documentType, String requestedNumber) {
        PurchaseDocumentNumberSetting setting = getLockedSetting(documentType);
        if (!setting.isAutoNumberingEnabled()) {
            return validateManualNumber(documentType, requestedNumber);
        }

        int sequence = nextSafeSequence(setting);
        String candidate = buildNumber(setting, sequence);
        while (existsExact(documentType, candidate)) {
            sequence++;
            candidate = buildNumber(setting, sequence);
        }

        setting.setNextNumber(sequence + 1);
        settingRepository.save(setting);
        return candidate;
    }

    @Transactional
    public String resolveNumberForUpdate(
            PurchaseDocumentType documentType,
            String existingNumber,
            String requestedNumber) {
        PurchaseDocumentNumberSetting setting = ensureSetting(documentType);
        if (setting.isAutoNumberingEnabled()) {
            return existingNumber;
        }

        String candidate = normalizeManualNumber(requestedNumber);
        if (Objects.equals(candidate, normalizeManualNumber(existingNumber))) {
            return existingNumber;
        }
        return validateManualNumber(documentType, requestedNumber);
    }

    private PurchaseDocumentNumberSetting getLockedSetting(PurchaseDocumentType documentType) {
        return settingRepository.findLockedByDocumentType(documentType)
                .orElseGet(() -> settingRepository.save(PurchaseDocumentNumberSetting.defaultFor(documentType)));
    }

    private PurchaseDocumentNumberSetting ensureSetting(PurchaseDocumentType documentType) {
        PurchaseDocumentNumberSetting setting = settingRepository.findById(documentType)
                .orElseGet(() -> settingRepository.save(PurchaseDocumentNumberSetting.defaultFor(documentType)));
        setting.setLabel(documentType.getLabel());
        setting.setPrefix(normalizePrefix(setting.getPrefix(), documentType));
        setting.setNextNumber(normalizeNextNumber(setting.getNextNumber()));
        return settingRepository.save(setting);
    }

    private int nextSafeSequence(PurchaseDocumentNumberSetting setting) {
        String prefix = configuredPrefix(setting);
        int configuredNext = normalizeNextNumber(setting.getNextNumber());
        int existingNext = findExistingNumbersByPrefix(setting.getDocumentType(), prefix).stream()
                .map(number -> parseSequence(number, prefix))
                .flatMap(Optional::stream)
                .max(Integer::compareTo)
                .map(value -> value + 1)
                .orElse(MIN_NEXT_NUMBER);
        return Math.max(configuredNext, existingNext);
    }

    private String buildNumber(PurchaseDocumentNumberSetting setting, int sequence) {
        return configuredPrefix(setting) + String.format("%04d", sequence);
    }

    private String configuredPrefix(PurchaseDocumentNumberSetting setting) {
        return normalizePrefix(setting.getPrefix(), setting.getDocumentType())
                + "-"
                + LocalDate.now().getYear()
                + "-";
    }

    private Optional<Integer> parseSequence(String documentNumber, String prefix) {
        if (documentNumber == null || !documentNumber.startsWith(prefix)) {
            return Optional.empty();
        }
        String sequence = documentNumber.substring(prefix.length());
        if (sequence.isBlank() || !sequence.chars().allMatch(Character::isDigit)) {
            return Optional.empty();
        }
        try {
            return Optional.of(Integer.parseInt(sequence));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    private String validateManualNumber(PurchaseDocumentType documentType, String requestedNumber) {
        String manualNumber = normalizeManualNumber(requestedNumber);
        if (manualNumber == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    documentType.getLabel() + " number is required when auto numbering is OFF.");
        }
        if (existsExact(documentType, manualNumber)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    documentType.getLabel() + " number already exists: " + manualNumber);
        }
        return manualNumber;
    }

    private String normalizeManualNumber(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isBlank() ? null : normalized;
    }

    private String normalizePrefix(String prefix, PurchaseDocumentType documentType) {
        String normalized = prefix == null ? "" : prefix.trim().toUpperCase(Locale.ROOT);
        normalized = normalized.replaceAll("[^A-Z0-9]+", "-").replaceAll("^-+|-+$", "");
        if (normalized.isBlank()) {
            normalized = documentType.getDefaultPrefix();
        }
        return normalized;
    }

    private int normalizeNextNumber(Integer nextNumber) {
        return nextNumber != null && nextNumber >= MIN_NEXT_NUMBER ? nextNumber : MIN_NEXT_NUMBER;
    }

    private List<String> findExistingNumbersByPrefix(PurchaseDocumentType documentType, String prefix) {
        return switch (documentType) {
            case LPO -> lpoRepository.findLpoNumbersByPrefix(prefix);
            case GRN -> grnRepository.findGrnNumbersByPrefix(prefix);
            case PURCHASE_INVOICE -> purchaseInvoiceRepository.findInvoiceNumbersByPrefix(prefix);
            case PAYMENT_VOUCHER -> paymentVoucherRepository.findVoucherNumbersByPrefix(prefix);
        };
    }

    private boolean existsExact(PurchaseDocumentType documentType, String documentNumber) {
        return switch (documentType) {
            case LPO -> lpoRepository.existsByLpoNumber(documentNumber);
            case GRN -> grnRepository.existsByGrnNo(documentNumber);
            case PURCHASE_INVOICE -> purchaseInvoiceRepository.existsByInvoiceNumber(documentNumber);
            case PAYMENT_VOUCHER -> paymentVoucherRepository.existsByVoucherNumber(documentNumber);
        };
    }
}
