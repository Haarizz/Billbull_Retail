package com.billbull.backend.sales.settings;

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

import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.delivery.DeliveryNoteRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.payment.PaymentRepository;
import com.billbull.backend.sales.proforma.ProformaRepository;
import com.billbull.backend.sales.quotation.QuotationRepository;
import com.billbull.backend.sales.returns.SalesReturnRepository;
import com.billbull.backend.sales.salesorder.SalesOrderRepository;

@ExtendWith(MockitoExtension.class)
class SalesDocumentNumberingServiceTest {

    @Mock private SalesDocumentNumberSettingRepository settingRepository;
    @Mock private CustomerRepository customerRepository;
    @Mock private QuotationRepository quotationRepository;
    @Mock private SalesOrderRepository salesOrderRepository;
    @Mock private ProformaRepository proformaRepository;
    @Mock private SalesInvoiceRepository salesInvoiceRepository;
    @Mock private DeliveryNoteRepository deliveryNoteRepository;
    @Mock private SalesReturnRepository salesReturnRepository;
    @Mock private PaymentRepository paymentRepository;

    private SalesDocumentNumberingService service;

    @BeforeEach
    void setUp() {
        service = new SalesDocumentNumberingService(
                settingRepository,
                customerRepository,
                quotationRepository,
                salesOrderRepository,
                proformaRepository,
                salesInvoiceRepository,
                deliveryNoteRepository,
                salesReturnRepository,
                paymentRepository);
    }

    @Test
    void autoNumberingClampsAboveExistingNumbersAndIncrementsNextNumber() {
        SalesDocumentNumberSetting setting = SalesDocumentNumberSetting.defaultFor(SalesDocumentType.SALES_INVOICE);
        setting.setPrefix("INV");
        setting.setNextNumber(2);

        String yearPrefix = "INV-" + LocalDate.now().getYear() + "-";
        when(settingRepository.findLockedByDocumentType(SalesDocumentType.SALES_INVOICE))
                .thenReturn(Optional.of(setting));
        when(salesInvoiceRepository.findInvoiceNumbersByPrefix(yearPrefix))
                .thenReturn(List.of(yearPrefix + "0004"));
        when(salesInvoiceRepository.findByInvoiceNumber(yearPrefix + "0005"))
                .thenReturn(Optional.empty());

        String number = service.resolveNumberForCreate(SalesDocumentType.SALES_INVOICE, null);

        assertEquals(yearPrefix + "0005", number);
        assertEquals(6, setting.getNextNumber());
        verify(settingRepository).save(setting);
    }

    @Test
    void manualNumberingRequiresUniqueManualNumberAndDoesNotIncrement() {
        SalesDocumentNumberSetting setting = SalesDocumentNumberSetting.defaultFor(SalesDocumentType.SALES_INVOICE);
        setting.setAutoNumberingEnabled(false);
        setting.setNextNumber(7);

        when(settingRepository.findLockedByDocumentType(SalesDocumentType.SALES_INVOICE))
                .thenReturn(Optional.of(setting));
        when(salesInvoiceRepository.findByInvoiceNumber("MANUAL-42"))
                .thenReturn(Optional.empty());

        String number = service.resolveNumberForCreate(SalesDocumentType.SALES_INVOICE, " MANUAL-42 ");

        assertEquals("MANUAL-42", number);
        assertEquals(7, setting.getNextNumber());
        verify(settingRepository, never()).save(any());
    }

    @Test
    void manualNumberingRejectsBlankNumbers() {
        SalesDocumentNumberSetting setting = SalesDocumentNumberSetting.defaultFor(SalesDocumentType.SALES_INVOICE);
        setting.setAutoNumberingEnabled(false);

        when(settingRepository.findLockedByDocumentType(SalesDocumentType.SALES_INVOICE))
                .thenReturn(Optional.of(setting));

        assertThrows(ResponseStatusException.class,
                () -> service.resolveNumberForCreate(SalesDocumentType.SALES_INVOICE, " "));
    }
}
