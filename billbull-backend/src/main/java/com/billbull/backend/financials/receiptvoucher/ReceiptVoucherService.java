package com.billbull.backend.financials.receiptvoucher;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
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

import jakarta.annotation.PostConstruct;

import com.billbull.backend.financials.audit.FinancialAuditService;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.customerledger.OpeningInvoice;
import com.billbull.backend.sales.customerledger.OpeningInvoiceRepository;
import com.billbull.backend.sales.invoice.DeliveryStatus;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.util.DocumentOrderingUtil;

@Service
public class ReceiptVoucherService {

    private final ReceiptVoucherRepository repository;
    private final Path fileStorageLocation;
    private final PostingEngineService postingEngineService;
    private final FinancialAuditService auditService;
    private final SalesInvoiceRepository salesInvoiceRepository;
    private final OpeningInvoiceRepository openingInvoiceRepository;
    private final CustomerRepository customerRepository;
    private final BranchAccessService branchAccessService;

    public ReceiptVoucherService(
            ReceiptVoucherRepository repository,
            PostingEngineService postingEngineService,
            FinancialAuditService auditService,
            SalesInvoiceRepository salesInvoiceRepository,
            OpeningInvoiceRepository openingInvoiceRepository,
            CustomerRepository customerRepository,
            BranchAccessService branchAccessService,
            @Value("${file.upload-dir:uploads/receipts}") String uploadDir) {
        this.repository = repository;
        this.postingEngineService = postingEngineService;
        this.auditService = auditService;
        this.salesInvoiceRepository = salesInvoiceRepository;
        this.openingInvoiceRepository = openingInvoiceRepository;
        this.customerRepository = customerRepository;
        this.branchAccessService = branchAccessService;
        this.fileStorageLocation = Paths.get(uploadDir).toAbsolutePath().normalize();

        try {
            Files.createDirectories(this.fileStorageLocation);
        } catch (Exception ex) {
            throw new RuntimeException("Could not create the directory where the uploaded files will be stored.", ex);
        }
    }

    @Transactional(readOnly = true)
    public List<ReceiptVoucher> getAllReceipts() {
        List<ReceiptVoucher> receipts = new ArrayList<>(branchAccessService.filterBranchScopedByBranch(
                repository.findAll(), ReceiptVoucher::getBranchEntity));
        DocumentOrderingUtil.sortByDocumentNumberAndDateDesc(
                receipts,
                ReceiptVoucher::getDate,
                ReceiptVoucher::getVoucherId,
                ReceiptVoucher::getId);
        receipts.forEach(ReceiptVoucher::snapshotBranchFields);
        return receipts;
    }

    @Transactional(readOnly = true)
    public ReceiptVoucher getReceiptById(Long id) {
        ReceiptVoucher rv = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Receipt not found with id " + id));
        rv.snapshotBranchFields();
        return rv;
    }

    /**
     * Backfill customer_code on existing ReceiptVoucher rows that pre-date the column.
     * Runs once at startup; skips rows it cannot resolve without failing.
     */
    @PostConstruct
    @Transactional
    public void backfillCustomerCodes() {
        List<ReceiptVoucher> missing = repository.findWithoutCustomerCode();
        for (ReceiptVoucher rv : missing) {
            try {
                resolveAndSetCustomerCode(rv);
                if (rv.getCustomerCode() != null) {
                    repository.save(rv);
                }
            } catch (Exception ignored) {
                // Skip unresolvable rows silently
            }
        }
    }

    @Transactional
    public ReceiptVoucher createReceipt(ReceiptVoucher receipt, MultipartFile file) {
        receipt.setVoucherId(generateNextVoucherId());
        receipt.setBranchEntity(branchAccessService.getRequiredCurrentUserBranch());

        if (receipt.getStatus() == null) {
            receipt.setStatus("Completed");
        }

        resolveAndSetCustomerCode(receipt);
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
        syncOpeningInvoice(saved.getOpeningInvoiceId());
        saved.snapshotBranchFields();
        return saved;
    }

    @Transactional
    public ReceiptVoucher updateReceipt(Long id, ReceiptVoucher receiptDetails, MultipartFile file) {
        ReceiptVoucher receipt = getReceiptById(id);
        Long existingBranchId = receipt.getBranchEntity() != null ? receipt.getBranchEntity().getId() : null;
        branchAccessService.assertTransactionBranchAccessible(existingBranchId, "Receipt Voucher");
        // Branch is immutable on update — receipt.branchEntity stays as-is, never copied from receiptDetails.

        String previousStatus = receipt.getStatus();
        Long previousInvoiceId = receipt.getSalesInvoiceId();
        Long previousOpeningInvoiceId = receipt.getOpeningInvoiceId();

        receipt.setDate(receiptDetails.getDate());
        receipt.setBranch(receiptDetails.getBranch());
        receipt.setMemberName(receiptDetails.getMemberName());
        receipt.setCategory(receiptDetails.getCategory());
        receipt.setAmount(receiptDetails.getAmount());
        receipt.setPaymentMode(receiptDetails.getPaymentMode());
        receipt.setReference(receiptDetails.getReference());
        receipt.setNotes(receiptDetails.getNotes());
        receipt.setPurpose(receiptDetails.getPurpose());
        if (receiptDetails.getSalesInvoiceId() != null) {
            receipt.setSalesInvoiceId(receiptDetails.getSalesInvoiceId());
        }
        if (receiptDetails.getOpeningInvoiceId() != null) {
            receipt.setOpeningInvoiceId(receiptDetails.getOpeningInvoiceId());
        }
        // Inherit explicit customerCode if provided, then re-resolve from linked doc
        if (receiptDetails.getCustomerCode() != null && !receiptDetails.getCustomerCode().isBlank()) {
            receipt.setCustomerCode(receiptDetails.getCustomerCode());
        } else {
            receipt.setCustomerCode(null); // clear so resolveAndSetCustomerCode re-derives it
            resolveAndSetCustomerCode(receipt);
        }

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
        syncOpeningInvoice(previousOpeningInvoiceId);
        if (!Objects.equals(previousOpeningInvoiceId, saved.getOpeningInvoiceId())) {
            syncOpeningInvoice(saved.getOpeningInvoiceId());
        }

        auditService.logEvent("RECEIPT_VOUCHER", saved.getVoucherId(), "UPDATED",
                "System", "Status: " + previousStatus + " -> " + saved.getStatus());

        saved.snapshotBranchFields();
        return saved;
    }

    @Transactional
    public void deleteReceipt(Long id) {
        ReceiptVoucher receipt = getReceiptById(id);
        Long linkedInvoiceId = receipt.getSalesInvoiceId();
        Long linkedOpeningInvoiceId = receipt.getOpeningInvoiceId();
        auditService.logEvent("RECEIPT_VOUCHER", receipt.getVoucherId(), "DELETED",
                "System", "Receipt voucher deleted.");
        repository.delete(receipt);
        syncLinkedInvoice(linkedInvoiceId);
        syncOpeningInvoice(linkedOpeningInvoiceId);
    }

    public String generateNextVoucherId() {
        String year = java.time.Year.now().toString();
        String prefix = "RV-" + year + "-";
        String lastId = repository.findMaxVoucherIdByPrefix(prefix);
        int next = 1;
        if (lastId != null && lastId.startsWith(prefix)) {
            try {
                next = Integer.parseInt(lastId.substring(prefix.length())) + 1;
            } catch (NumberFormatException ignored) {
                next = 1;
            }
        }
        return String.format("%s%03d", prefix, next);
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

        boolean hasSalesInvoice = receipt.getSalesInvoiceId() != null;
        boolean hasOpeningInvoice = receipt.getOpeningInvoiceId() != null;
        if (hasSalesInvoice && hasOpeningInvoice) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Receipt can be linked to either a sales invoice or an opening balance bill, not both.");
        }

        if (!hasSalesInvoice && !hasOpeningInvoice) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Sales invoice or opening balance bill is required for receipts against invoice.");
        }

        if (hasOpeningInvoice) {
            validateOpeningInvoiceReceipt(receipt, currentReceiptId);
            return;
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

    private void validateOpeningInvoiceReceipt(ReceiptVoucher receipt, Long currentReceiptId) {
        OpeningInvoice openingInvoice = openingInvoiceRepository.findById(receipt.getOpeningInvoiceId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Linked opening balance bill was not found."));

        if (!isCompletedStatus(receipt.getStatus())) {
            return;
        }

        BigDecimal otherCompletedReceipts = repository.findByOpeningInvoiceId(openingInvoice.getId()).stream()
                .filter(existing -> !Objects.equals(existing.getId(), currentReceiptId))
                .filter(existing -> isCompletedStatus(existing.getStatus()))
                .map(ReceiptVoucher::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal openingBalance = normalizeOpeningBalanceSeed(
                openingInvoice,
                resolveOpeningBalanceAmount(openingInvoice),
                otherCompletedReceipts);
        BigDecimal remainingBalance = openingBalance.subtract(otherCompletedReceipts);
        if (remainingBalance.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This opening balance bill is already fully settled.");
        }

        if (receipt.getAmount().compareTo(remainingBalance.add(new BigDecimal("0.0001"))) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Receipt amount exceeds the opening balance bill balance.");
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

    private void syncOpeningInvoice(Long openingInvoiceId) {
        if (openingInvoiceId == null) {
            return;
        }

        openingInvoiceRepository.findById(openingInvoiceId).ifPresent(openingInvoice -> {
            BigDecimal openingBalance = resolveOpeningBalanceAmount(openingInvoice);
            if (openingInvoice.getOpeningBalanceAmount() == null
                    || openingInvoice.getOpeningBalanceAmount().compareTo(BigDecimal.ZERO) <= 0) {
                openingInvoice.setOpeningBalanceAmount(openingBalance);
            }

            BigDecimal totalPaid = repository.findByOpeningInvoiceId(openingInvoiceId).stream()
                    .filter(receipt -> isCompletedStatus(receipt.getStatus()))
                    .map(ReceiptVoucher::getAmount)
                    .filter(Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            BigDecimal balance = openingBalance.subtract(totalPaid);
            if (balance.compareTo(BigDecimal.ZERO) < 0) {
                balance = BigDecimal.ZERO;
            }

            openingInvoice.setOutstanding(balance);
            openingInvoiceRepository.save(openingInvoice);
            syncCustomerOpeningBalance(openingInvoice);
        });
    }

    private void syncCustomerOpeningBalance(OpeningInvoice openingInvoice) {
        Customer customer = openingInvoice.getCustomer();
        if (customer == null || customer.getCode() == null || customer.getCode().isBlank()) {
            return;
        }

        BigDecimal openingBalance = openingInvoiceRepository.findByCustomer_Code(customer.getCode()).stream()
                .map(this::resolveCurrentOutstanding)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        customer.setBalance(openingBalance);
        customerRepository.save(customer);
    }

    private BigDecimal resolveOpeningBalanceAmount(OpeningInvoice openingInvoice) {
        if (openingInvoice.getOpeningBalanceAmount() != null
                && openingInvoice.getOpeningBalanceAmount().compareTo(BigDecimal.ZERO) > 0) {
            return openingInvoice.getOpeningBalanceAmount();
        }

        BigDecimal outstanding = openingInvoice.getOutstanding();
        if (outstanding != null && outstanding.compareTo(BigDecimal.ZERO) > 0) {
            return outstanding;
        }

        BigDecimal amount = openingInvoice.getAmount();
        return amount != null ? amount : BigDecimal.ZERO;
    }

    private BigDecimal normalizeOpeningBalanceSeed(
            OpeningInvoice openingInvoice,
            BigDecimal openingBalance,
            BigDecimal existingCompletedReceipts) {
        BigDecimal currentOutstanding = openingInvoice.getOutstanding();
        if (currentOutstanding == null
                || currentOutstanding.compareTo(BigDecimal.ZERO) <= 0
                || currentOutstanding.compareTo(openingBalance) >= 0
                || existingCompletedReceipts.compareTo(BigDecimal.ZERO) > 0) {
            return openingBalance;
        }

        openingInvoice.setOpeningBalanceAmount(currentOutstanding);
        return currentOutstanding;
    }

    private BigDecimal resolveCurrentOutstanding(OpeningInvoice openingInvoice) {
        BigDecimal outstanding = openingInvoice.getOutstanding();
        if (outstanding != null && outstanding.compareTo(BigDecimal.ZERO) > 0) {
            return outstanding;
        }
        return BigDecimal.ZERO;
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

    /**
     * Resolves the customer code from the linked sales invoice or opening invoice
     * and stores it on the receipt. Safe to call when the code is already set
     * (it will not overwrite a non-blank value).
     */
    private void resolveAndSetCustomerCode(ReceiptVoucher receipt) {
        if (receipt.getCustomerCode() != null && !receipt.getCustomerCode().isBlank()) {
            return;
        }
        if (receipt.getSalesInvoiceId() != null) {
            salesInvoiceRepository.findById(receipt.getSalesInvoiceId())
                    .ifPresent(inv -> receipt.setCustomerCode(inv.getCustomerCode()));
        } else if (receipt.getOpeningInvoiceId() != null) {
            openingInvoiceRepository.findById(receipt.getOpeningInvoiceId()).ifPresent(oi -> {
                if (oi.getCustomer() != null) {
                    receipt.setCustomerCode(oi.getCustomer().getCode());
                }
            });
        }
    }
}
