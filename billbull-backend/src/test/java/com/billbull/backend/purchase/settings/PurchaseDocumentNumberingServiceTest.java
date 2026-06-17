package com.billbull.backend.purchase.settings;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.purchase.grn.GrnRepository;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.purchase.lpo.LpoRepository;
import com.billbull.backend.purchase.payment.PaymentVoucherRepository;

@ExtendWith(MockitoExtension.class)
class PurchaseDocumentNumberingServiceTest {

    @Mock private PurchaseDocumentNumberSettingRepository settingRepository;
    @Mock private LpoRepository lpoRepository;
    @Mock private GrnRepository grnRepository;
    @Mock private PurchaseInvoiceRepository purchaseInvoiceRepository;
    @Mock private PaymentVoucherRepository paymentVoucherRepository;

    private PurchaseDocumentNumberingService service;

    @BeforeEach
    void setUp() {
        service = new PurchaseDocumentNumberingService(
                settingRepository,
                lpoRepository,
                grnRepository,
                purchaseInvoiceRepository,
                paymentVoucherRepository);
    }

    @Test
    void autoNumberingClampsAboveExistingNumbersAndIncrementsNextNumber() {
        PurchaseDocumentNumberSetting setting = PurchaseDocumentNumberSetting.defaultFor(PurchaseDocumentType.PURCHASE_INVOICE);
        setting.setPrefix("PINV");
        setting.setNextNumber(2);

        String yearPrefix = "PINV-" + LocalDate.now().getYear() + "-";
        when(settingRepository.findLockedByDocumentType(PurchaseDocumentType.PURCHASE_INVOICE))
                .thenReturn(Optional.of(setting));
        when(purchaseInvoiceRepository.findInvoiceNumbersByPrefix(yearPrefix))
                .thenReturn(List.of(yearPrefix + "0004"));
        when(purchaseInvoiceRepository.existsByInvoiceNumber(yearPrefix + "0005"))
                .thenReturn(false);

        String number = service.resolveNumberForCreate(PurchaseDocumentType.PURCHASE_INVOICE, null);

        assertEquals(yearPrefix + "0005", number);
        assertEquals(6, setting.getNextNumber());
        verify(settingRepository).save(setting);
    }

    @Test
    void manualNumberingRequiresUniqueManualNumberAndDoesNotIncrement() {
        PurchaseDocumentNumberSetting setting = PurchaseDocumentNumberSetting.defaultFor(PurchaseDocumentType.PURCHASE_INVOICE);
        setting.setAutoNumberingEnabled(false);
        setting.setNextNumber(7);

        when(settingRepository.findLockedByDocumentType(PurchaseDocumentType.PURCHASE_INVOICE))
                .thenReturn(Optional.of(setting));
        when(purchaseInvoiceRepository.existsByInvoiceNumber("MANUAL-42"))
                .thenReturn(false);

        String number = service.resolveNumberForCreate(PurchaseDocumentType.PURCHASE_INVOICE, " MANUAL-42 ");

        assertEquals("MANUAL-42", number);
        assertEquals(7, setting.getNextNumber());
        verify(settingRepository, never()).save(any());
    }

    @Test
    void manualNumberingRejectsBlankNumbers() {
        PurchaseDocumentNumberSetting setting = PurchaseDocumentNumberSetting.defaultFor(PurchaseDocumentType.PURCHASE_INVOICE);
        setting.setAutoNumberingEnabled(false);

        when(settingRepository.findLockedByDocumentType(PurchaseDocumentType.PURCHASE_INVOICE))
                .thenReturn(Optional.of(setting));

        assertThrows(ResponseStatusException.class,
                () -> service.resolveNumberForCreate(PurchaseDocumentType.PURCHASE_INVOICE, " "));
    }
}
