package com.billbull.backend.document.share;

import com.billbull.backend.document.HtmlPdfService;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceService;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.sales.quotation.QuotationRepository;
import com.billbull.backend.sales.quotation.QuotationService;
import com.billbull.backend.sales.salesorder.SalesOrderRepository;
import com.billbull.backend.sales.salesorder.SalesOrderService;
import com.billbull.backend.settings.company.CompanyProfile;
import com.billbull.backend.settings.company.CompanyProfileService;
import com.billbull.backend.settings.whatsapp.WhatsAppDocumentType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DocumentShareLinkServiceTest {

    private static final byte[] PDF = "%PDF-1.7 body %%EOF".getBytes(StandardCharsets.US_ASCII);

    @Mock DocumentShareLinkRepository repository;
    @Mock SalesInvoiceService invoiceService;
    @Mock SalesInvoiceRepository invoiceRepository;
    @Mock QuotationService quotationService;
    @Mock QuotationRepository quotationRepository;
    @Mock SalesOrderService salesOrderService;
    @Mock SalesOrderRepository salesOrderRepository;
    @Mock CompanyProfileService companyProfileService;
    @Mock HtmlPdfService pdfService;

    private DocumentShareLinkService service;

    @BeforeEach
    void setUp() {
        service = new DocumentShareLinkService(repository, invoiceService, invoiceRepository, quotationService,
                quotationRepository, salesOrderService, salesOrderRepository, companyProfileService, pdfService, 180);
        CompanyProfile profile = new CompanyProfile();
        profile.setCompanyName("Pulse Retail");
        profile.setCurrency("AED");
        lenient().when(companyProfileService.getProfile()).thenReturn(profile);
    }

    @Test
    void createStoresOnlyTheTokenHashAndLoadsThroughTheAccessCheckedService() {
        when(invoiceService.getById(7L)).thenReturn(invoice());

        DocumentShareLinkService.Created created = service.create(WhatsAppDocumentType.SALES_INVOICE, 7L, "<html>x</html>");

        ArgumentCaptor<DocumentShareLink> saved = ArgumentCaptor.forClass(DocumentShareLink.class);
        verify(repository).save(saved.capture());
        assertThat(created.token()).matches(DocumentShareLinkService.TOKEN_FORMAT);
        assertThat(created.path()).isEqualTo("/d/" + created.token());
        assertThat(saved.getValue().getTokenHash())
                .isEqualTo(DocumentShareLinkService.sha256(created.token()))
                .isNotEqualTo(created.token());
        assertThat(saved.getValue().getDocumentNo()).isEqualTo("INV-7");
        assertThat(saved.getValue().getBranchId()).isEqualTo(3L);
        assertThat(saved.getValue().getExpiresAt()).isAfter(LocalDateTime.now().plusDays(179));
        assertThat(created.summary().balance()).isEqualByComparingTo("50");
        assertThat(created.company().name()).isEqualTo("Pulse Retail");
        verifyNoInteractions(invoiceRepository, pdfService);
    }

    @Test
    void createRefusesBlankHtmlBeforeLoadingTheDocument() {
        assertThatThrownBy(() -> service.create(WhatsAppDocumentType.SALES_INVOICE, 7L, " "))
                .isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(invoiceService, repository);
    }

    @Test
    void createPropagatesTheServiceAccessDenial() {
        when(invoiceService.getById(7L)).thenThrow(new RuntimeException("Sales Invoice not found: 7"));
        assertThatThrownBy(() -> service.create(WhatsAppDocumentType.SALES_INVOICE, 7L, "<p/>"))
                .hasMessageContaining("not found");
        verify(repository, never()).save(any());
    }

    @Test
    void malformedTokenIs404WithoutAQuery() {
        assertThatThrownBy(() -> service.view("short"))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
        verifyNoInteractions(repository);
    }

    @Test
    void revokedLinkIs404() {
        String token = DocumentShareLinkService.newToken();
        DocumentShareLink link = link(null);
        link.setActive(false);
        when(repository.findByTokenHash(DocumentShareLinkService.sha256(token))).thenReturn(Optional.of(link));
        assertThatThrownBy(() -> service.view(token))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void expiredLinkIs410() {
        String token = DocumentShareLinkService.newToken();
        when(repository.findByTokenHash(anyString())).thenReturn(Optional.of(link(LocalDateTime.now().minusMinutes(1))));
        assertThatThrownBy(() -> service.view(token))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.GONE));
    }

    @Test
    void deletedDocumentIs410() {
        String token = DocumentShareLinkService.newToken();
        when(repository.findByTokenHash(anyString())).thenReturn(Optional.of(link(null)));
        when(invoiceRepository.findById(7L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.view(token))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.GONE));
    }

    @Test
    void viewReadsTheLiveDocumentAndCountsTheView() {
        String token = DocumentShareLinkService.newToken();
        DocumentShareLink link = link(null);
        when(repository.findByTokenHash(DocumentShareLinkService.sha256(token))).thenReturn(Optional.of(link));
        SalesInvoice paidSince = invoice();
        paidSince.setAmountPaid(new BigDecimal("250"));
        paidSince.setBalance(BigDecimal.ZERO);
        when(invoiceRepository.findById(7L)).thenReturn(Optional.of(paidSince));

        DocumentShareLinkService.PublicView view = service.view(token);

        assertThat(view.summary().statusLabel()).isEqualTo("Paid");
        assertThat(view.html()).isEqualTo("<html>doc</html>");
        verify(repository).recordView(eq(11L), any());
        verifyNoInteractions(invoiceService);
    }

    @Test
    void pdfIsRenderedOnceThenServedFromTheStoredCopy() {
        String token = DocumentShareLinkService.newToken();
        DocumentShareLink link = link(null);
        when(repository.findByTokenHash(anyString())).thenReturn(Optional.of(link));
        when(invoiceRepository.findById(7L)).thenReturn(Optional.of(invoice()));
        when(pdfService.render("<html>doc</html>")).thenReturn(PDF);

        DocumentShareLinkService.Pdf first = service.pdf(token);
        assertThat(first.bytes()).isEqualTo(PDF);
        assertThat(first.filename()).isEqualTo("INV-7.pdf");
        verify(repository).storePdf(11L, PDF);

        link.setPdf(PDF);
        service.pdf(token);
        verify(pdfService, times(1)).render(anyString());
    }

    @Test
    void receiptPresentationLabelsAPosSaleAsAReceiptOnCreateAndView() {
        when(invoiceService.getById(7L)).thenReturn(invoice());
        DocumentShareLinkService.Created created = service.create(WhatsAppDocumentType.SALES_INVOICE, 7L, "<p/>", "RECEIPT");
        ArgumentCaptor<DocumentShareLink> saved = ArgumentCaptor.forClass(DocumentShareLink.class);
        verify(repository).save(saved.capture());
        assertThat(created.summary().label()).isEqualTo("Receipt");
        assertThat(saved.getValue().getDocumentLabel()).isEqualTo("Receipt");

        String token = DocumentShareLinkService.newToken();
        DocumentShareLink link = link(null);
        link.setDocumentLabel("Receipt");
        when(repository.findByTokenHash(anyString())).thenReturn(Optional.of(link));
        when(invoiceRepository.findById(7L)).thenReturn(Optional.of(invoice()));
        assertThat(service.view(token).summary().label()).isEqualTo("Receipt");
    }

    @Test
    void receiptPresentationIsIgnoredForOtherTypesAndUnknownValues() {
        assertThat(DocumentShareLinkService.labelFor(WhatsAppDocumentType.QUOTATION, "RECEIPT")).isNull();
        assertThat(DocumentShareLinkService.labelFor(WhatsAppDocumentType.SALES_INVOICE, "<b>x</b>")).isNull();
        assertThat(DocumentShareLinkService.labelFor(WhatsAppDocumentType.SALES_INVOICE, null)).isNull();
        assertThat(DocumentShareLinkService.labelFor(WhatsAppDocumentType.SALES_INVOICE, "receipt")).isEqualTo("Receipt");
    }

    @Test
    void filenameIsSanitised() {
        assertThat(DocumentShareLinkService.safeFilename("INV/2026:01")).isEqualTo("INV_2026_01.pdf");
        assertThat(DocumentShareLinkService.safeFilename(null)).isEqualTo("document.pdf");
    }

    private static DocumentShareLink link(LocalDateTime expiresAt) {
        DocumentShareLink l = new DocumentShareLink();
        l.setId(11L);
        l.setDocumentType("SALES_INVOICE");
        l.setDocumentId(7L);
        l.setDocumentNo("INV-7");
        l.setHtml("<html>doc</html>");
        l.setExpiresAt(expiresAt);
        return l;
    }

    private static SalesInvoice invoice() {
        SalesInvoice inv = new SalesInvoice();
        inv.setId(7L);
        inv.setBranchId(3L);
        inv.setInvoiceNumber("INV-7");
        inv.setInvoiceTotal(new BigDecimal("250"));
        inv.setAmountPaid(new BigDecimal("200"));
        inv.setBalance(new BigDecimal("50"));
        inv.setStatus(SalesInvoiceStatus.PARTIALLY_PAID);
        return inv;
    }
}
