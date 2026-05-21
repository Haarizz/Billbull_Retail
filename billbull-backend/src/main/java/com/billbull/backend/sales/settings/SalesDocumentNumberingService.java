package com.billbull.backend.sales.settings;

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

import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.delivery.DeliveryNoteRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.payment.PaymentRepository;
import com.billbull.backend.sales.proforma.ProformaRepository;
import com.billbull.backend.sales.quotation.QuotationRepository;
import com.billbull.backend.sales.returns.SalesReturnRepository;
import com.billbull.backend.sales.salesorder.SalesOrderRepository;

@Service
public class SalesDocumentNumberingService {

    private static final int MIN_NEXT_NUMBER = 1;

    private final SalesDocumentNumberSettingRepository settingRepository;
    private final CustomerRepository customerRepository;
    private final QuotationRepository quotationRepository;
    private final SalesOrderRepository salesOrderRepository;
    private final ProformaRepository proformaRepository;
    private final SalesInvoiceRepository salesInvoiceRepository;
    private final DeliveryNoteRepository deliveryNoteRepository;
    private final SalesReturnRepository salesReturnRepository;
    private final PaymentRepository paymentRepository;

    public SalesDocumentNumberingService(
            SalesDocumentNumberSettingRepository settingRepository,
            CustomerRepository customerRepository,
            QuotationRepository quotationRepository,
            SalesOrderRepository salesOrderRepository,
            ProformaRepository proformaRepository,
            SalesInvoiceRepository salesInvoiceRepository,
            DeliveryNoteRepository deliveryNoteRepository,
            SalesReturnRepository salesReturnRepository,
            PaymentRepository paymentRepository) {
        this.settingRepository = settingRepository;
        this.customerRepository = customerRepository;
        this.quotationRepository = quotationRepository;
        this.salesOrderRepository = salesOrderRepository;
        this.proformaRepository = proformaRepository;
        this.salesInvoiceRepository = salesInvoiceRepository;
        this.deliveryNoteRepository = deliveryNoteRepository;
        this.salesReturnRepository = salesReturnRepository;
        this.paymentRepository = paymentRepository;
    }

    @Transactional
    public List<SalesDocumentNumberSetting> getAllSettingsWithPreview() {
        return Arrays.stream(SalesDocumentType.values())
                .map(this::getSettingWithPreview)
                .sorted(Comparator.comparingInt(setting -> setting.getDocumentType().ordinal()))
                .toList();
    }

    @Transactional
    public List<SalesDocumentNumberSetting> saveSettings(List<SalesDocumentNumberSetting> incomingSettings) {
        if (incomingSettings != null) {
            for (SalesDocumentNumberSetting incoming : incomingSettings) {
                if (incoming == null || incoming.getDocumentType() == null) {
                    continue;
                }

                SalesDocumentNumberSetting saved = ensureSetting(incoming.getDocumentType());
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
    public boolean isAutoNumberingEnabled(SalesDocumentType documentType) {
        return settingRepository.findById(documentType)
                .map(SalesDocumentNumberSetting::isAutoNumberingEnabled)
                .orElse(true);
    }

    @Transactional
    public SalesDocumentNumberSetting getSettingWithPreview(SalesDocumentType documentType) {
        SalesDocumentNumberSetting setting = ensureSetting(documentType);
        setting.setPreview(buildNumber(setting, nextSafeSequence(setting)));
        return setting;
    }

    @Transactional
    public String preview(SalesDocumentType documentType) {
        return getSettingWithPreview(documentType).getPreview();
    }

    @Transactional
    public String resolveNumberForCreate(SalesDocumentType documentType, String requestedNumber) {
        SalesDocumentNumberSetting setting = getLockedSetting(documentType);
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
            SalesDocumentType documentType,
            String existingNumber,
            String requestedNumber) {
        SalesDocumentNumberSetting setting = ensureSetting(documentType);
        if (setting.isAutoNumberingEnabled()) {
            return existingNumber;
        }

        String candidate = normalizeManualNumber(requestedNumber);
        if (Objects.equals(candidate, normalizeManualNumber(existingNumber))) {
            return existingNumber;
        }
        return validateManualNumber(documentType, requestedNumber);
    }

    private SalesDocumentNumberSetting getLockedSetting(SalesDocumentType documentType) {
        return settingRepository.findLockedByDocumentType(documentType)
                .orElseGet(() -> settingRepository.save(SalesDocumentNumberSetting.defaultFor(documentType)));
    }

    private SalesDocumentNumberSetting ensureSetting(SalesDocumentType documentType) {
        SalesDocumentNumberSetting setting = settingRepository.findById(documentType)
                .orElseGet(() -> settingRepository.save(SalesDocumentNumberSetting.defaultFor(documentType)));
        setting.setLabel(documentType.getLabel());
        setting.setPrefix(normalizePrefix(setting.getPrefix(), documentType));
        setting.setNextNumber(normalizeNextNumber(setting.getNextNumber()));
        return settingRepository.save(setting);
    }

    private int nextSafeSequence(SalesDocumentNumberSetting setting) {
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

    private String buildNumber(SalesDocumentNumberSetting setting, int sequence) {
        return configuredPrefix(setting) + String.format("%04d", sequence);
    }

    private String configuredPrefix(SalesDocumentNumberSetting setting) {
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

    private String validateManualNumber(SalesDocumentType documentType, String requestedNumber) {
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

    private String normalizePrefix(String prefix, SalesDocumentType documentType) {
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

    private List<String> findExistingNumbersByPrefix(SalesDocumentType documentType, String prefix) {
        return switch (documentType) {
            case CUSTOMER -> customerRepository.findCodesByPrefix(prefix);
            case QUOTATION -> quotationRepository.findQtnNumbersByPrefix(prefix);
            case SALES_ORDER -> salesOrderRepository.findSoNumbersByPrefix(prefix);
            case PROFORMA_INVOICE -> proformaRepository.findPiNumbersByPrefix(prefix);
            case SALES_INVOICE -> salesInvoiceRepository.findInvoiceNumbersByPrefix(prefix);
            case DELIVERY_NOTE -> deliveryNoteRepository.findDnNumbersByPrefix(prefix);
            case SALES_RETURN -> salesReturnRepository.findReturnNumbersByPrefix(prefix);
            case SALES_PAYMENT -> paymentRepository.findPaymentNumbersByPrefix(prefix);
        };
    }

    private boolean existsExact(SalesDocumentType documentType, String documentNumber) {
        return switch (documentType) {
            case CUSTOMER -> customerRepository.existsByCode(documentNumber);
            case QUOTATION -> quotationRepository.existsByQtnNo(documentNumber);
            case SALES_ORDER -> salesOrderRepository.existsBySoNumber(documentNumber);
            case PROFORMA_INVOICE -> proformaRepository.existsByPiNumber(documentNumber);
            case SALES_INVOICE -> salesInvoiceRepository.findByInvoiceNumber(documentNumber).isPresent();
            case DELIVERY_NOTE -> deliveryNoteRepository.existsByDnNumber(documentNumber);
            case SALES_RETURN -> salesReturnRepository.existsByReturnNumber(documentNumber);
            case SALES_PAYMENT -> paymentRepository.existsByPaymentNumber(documentNumber);
        };
    }
}
