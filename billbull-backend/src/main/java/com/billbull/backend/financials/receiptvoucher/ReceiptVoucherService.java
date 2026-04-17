package com.billbull.backend.financials.receiptvoucher;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.audit.FinancialAuditService;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.sales.invoice.DeliveryStatus;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;

@Service
public class ReceiptVoucherService {

    private final ReceiptVoucherRepository repository;
    private final Path fileStorageLocation;
    private final PostingEngineService postingEngineService;
    private final FinancialAuditService auditService;
    private final SalesInvoiceRepository salesInvoiceRepository;

    public ReceiptVoucherService(
            ReceiptVoucherRepository repository,
            PostingEngineService postingEngineService,
            FinancialAuditService auditService,
            SalesInvoiceRepository salesInvoiceRepository,
            @Value("${file.upload-dir:uploads/receipts}") String uploadDir) {
        this.repository = repository;
        this.postingEngineService = postingEngineService;
        this.auditService = auditService;
        this.salesInvoiceRepository = salesInvoiceRepository;
        this.fileStorageLocation = Paths.get(uploadDir).toAbsolutePath().normalize();

        try {
            Files.createDirectories(this.fileStorageLocation);
        } catch (Exception ex) {
            throw new RuntimeException("Could not create the directory where the uploaded files will be stored.", ex);
        }
    }

    public List<ReceiptVoucher> getAllReceipts() {
        return repository.findAllByOrderByDateDesc();
    }

    public ReceiptVoucher getReceiptById(Long id) {
        return repository.findById(id).orElseThrow(() -> new RuntimeException("Receipt not found with id " + id));
    }

    @Transactional
    public ReceiptVoucher createReceipt(ReceiptVoucher receipt, MultipartFile file) {
        long count = repository.count();
        String year = java.time.Year.now().toString();
        String voucherId = String.format("RV-%s-%03d", year, count + 1);
        receipt.setVoucherId(voucherId);

        if (receipt.getStatus() == null) {
            receipt.setStatus("Completed");
        }

        validateReceipt(receipt, null);

        if (file != null && !file.isEmpty()) {
            storeFile(file, receipt);
        }

        ReceiptVoucher saved = repository.save(receipt);

        auditService.logEvent("RECEIPT_VOUCHER", saved.getVoucherId(), "CREATED",
                "System", "Receipt created. Status: " + saved.getStatus() + ", Amount: " + saved.getAmount());

        if (isCompletedStatus(saved.getStatus())) {
            postingEngineService.createJournalFromReceiptVoucher(saved);
        }

        syncLinkedInvoice(saved.getSalesInvoiceId());
        return saved;
    }

    @Transactional
    public ReceiptVoucher updateReceipt(Long id, ReceiptVoucher receiptDetails, MultipartFile file) {
        ReceiptVoucher receipt = getReceiptById(id);
        String previousStatus = receipt.getStatus();
        Long previousInvoiceId = receipt.getSalesInvoiceId();

        receipt.setDate(receiptDetails.getDate());
        receipt.setBranch(receiptDetails.getBranch());
        receipt.setMemberName(receiptDetails.getMemberName());
        receipt.setCategory(receiptDetails.getCategory());
        receipt.setAmount(receiptDetails.getAmount());
        receipt.setPaymentMode(receiptDetails.getPaymentMode());
        receipt.setReference(receiptDetails.getReference());
        receipt.setNotes(receiptDetails.getNotes());
        receipt.setPurpose(receiptDetails.getPurpose());
        receipt.setSalesInvoiceId(receiptDetails.getSalesInvoiceId());

        if (receiptDetails.getStatus() != null) {
            receipt.setStatus(receiptDetails.getStatus());
        }

        validateReceipt(receipt, id);

        if (file != null && !file.isEmpty()) {
            storeFile(file, receipt);
        }

        ReceiptVoucher saved = repository.save(receipt);

        boolean isNewlyCompleted = isCompletedStatus(saved.getStatus())
                && !isCompletedStatus(previousStatus);
        if (isNewlyCompleted) {
            postingEngineService.createJournalFromReceiptVoucher(saved);
        }

        syncLinkedInvoice(previousInvoiceId);
        if (!Objects.equals(previousInvoiceId, saved.getSalesInvoiceId())) {
            syncLinkedInvoice(saved.getSalesInvoiceId());
        }

        auditService.logEvent("RECEIPT_VOUCHER", saved.getVoucherId(), "UPDATED",
                "System", "Status: " + previousStatus + " -> " + saved.getStatus());

        return saved;
    }

    @Transactional
    public void deleteReceipt(Long id) {
        ReceiptVoucher receipt = getReceiptById(id);
        Long linkedInvoiceId = receipt.getSalesInvoiceId();
        auditService.logEvent("RECEIPT_VOUCHER", receipt.getVoucherId(), "DELETED",
                "System", "Receipt voucher deleted.");
        repository.delete(receipt);
        syncLinkedInvoice(linkedInvoiceId);
    }

    private void storeFile(MultipartFile file, ReceiptVoucher receipt) {
        String originalFileName = StringUtils.cleanPath(Objects.requireNonNull(file.getOriginalFilename()));
        String fileName = UUID.randomUUID().toString() + "_" + originalFileName;

        try {
            if (fileName.contains("..")) {
                throw new RuntimeException("Sorry! Filename contains invalid path sequence " + fileName);
            }

            Path targetLocation = this.fileStorageLocation.resolve(fileName);
            Files.copy(file.getInputStream(), targetLocation, StandardCopyOption.REPLACE_EXISTING);

            receipt.setAttachmentName(originalFileName);
            receipt.setAttachmentPath(targetLocation.toString());
        } catch (IOException ex) {
            throw new RuntimeException("Could not store file " + fileName + ". Please try again!", ex);
        }
    }

    private void validateReceipt(ReceiptVoucher receipt, Long currentReceiptId) {
        if (receipt.getAmount() == null || receipt.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Receipt amount must be greater than zero.");
        }

        if (receipt.getPurpose() != ReceiptPurpose.AGAINST_INVOICE) {
            return;
        }

        if (receipt.getSalesInvoiceId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Sales invoice is required for receipts against invoice.");
        }

        SalesInvoice invoice = salesInvoiceRepository.findById(receipt.getSalesInvoiceId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Linked sales invoice was not found."));

        if (invoice.getStatus() == SalesInvoiceStatus.DRAFT || invoice.getStatus() == SalesInvoiceStatus.CANCELLED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only active sales invoices can receive customer payments.");
        }

        if (!isCompletedStatus(receipt.getStatus())) {
            return;
        }

        double otherCompletedReceipts = repository.findBySalesInvoiceId(invoice.getId()).stream()
                .filter(existing -> !Objects.equals(existing.getId(), currentReceiptId))
                .filter(existing -> isCompletedStatus(existing.getStatus()))
                .map(ReceiptVoucher::getAmount)
                .filter(Objects::nonNull)
                .mapToDouble(BigDecimal::doubleValue)
                .sum();

        double invoiceTotal = invoice.getInvoiceTotal() != null ? invoice.getInvoiceTotal() : 0.0;
        double remainingBalance = invoiceTotal - otherCompletedReceipts;
        if (remainingBalance <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This sales invoice is already fully settled.");
        }

        if (receipt.getAmount().doubleValue() > remainingBalance + 0.0001d) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Receipt amount exceeds the sales invoice balance.");
        }
    }

    private void syncLinkedInvoice(Long salesInvoiceId) {
        if (salesInvoiceId == null) {
            return;
        }

        salesInvoiceRepository.findById(salesInvoiceId).ifPresent(invoice -> {
            if (invoice.getStatus() == SalesInvoiceStatus.CANCELLED) {
                return;
            }

            double totalPaid = repository.findBySalesInvoiceId(salesInvoiceId).stream()
                    .filter(receipt -> isCompletedStatus(receipt.getStatus()))
                    .map(ReceiptVoucher::getAmount)
                    .filter(Objects::nonNull)
                    .mapToDouble(BigDecimal::doubleValue)
                    .sum();

            double invoiceTotal = invoice.getInvoiceTotal() != null ? invoice.getInvoiceTotal() : 0.0;
            double balance = Math.max(invoiceTotal - totalPaid, 0.0);

            invoice.setAmountPaid(totalPaid);
            invoice.setBalance(balance);
            invoice.setStatus(resolveInvoiceStatus(invoice, totalPaid, invoiceTotal));

            salesInvoiceRepository.save(invoice);
        });
    }

    private boolean isEffectivelyDelivered(SalesInvoice invoice) {
        DeliveryStatus ds = invoice.getDeliveryStatus();
        // AUTO_DELIVERED = system-generated delivery (direct sale / walk-in)
        // null = no delivery required (e.g. service invoice)
        return ds == DeliveryStatus.DELIVERED
                || ds == DeliveryStatus.AUTO_DELIVERED
                || ds == null;
    }

    private SalesInvoiceStatus resolveInvoiceStatus(SalesInvoice invoice, double totalPaid, double invoiceTotal) {
        SalesInvoiceStatus currentStatus = invoice.getStatus();
        if (currentStatus == SalesInvoiceStatus.DRAFT || currentStatus == SalesInvoiceStatus.CANCELLED) {
            return currentStatus;
        }

        boolean delivered = isEffectivelyDelivered(invoice);

        if (totalPaid >= invoiceTotal && invoiceTotal > 0) {
            return delivered ? SalesInvoiceStatus.PAID : SalesInvoiceStatus.PARTIALLY_PAID;
        }

        if (totalPaid > 0) {
            return SalesInvoiceStatus.PARTIALLY_PAID;
        }

        if (currentStatus == SalesInvoiceStatus.PAID || currentStatus == SalesInvoiceStatus.PARTIALLY_PAID) {
            return delivered ? SalesInvoiceStatus.CONFIRMED : SalesInvoiceStatus.POSTED;
        }

        return currentStatus != null ? currentStatus : SalesInvoiceStatus.POSTED;
    }

    private boolean isCompletedStatus(String status) {
        return status != null && "Completed".equalsIgnoreCase(status.trim());
    }
}
