package com.billbull.backend.financials.expensevoucher;

import java.time.LocalDate;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.financials.generalledger.voucher.VoucherSequenceService;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchRepository;

@Service
public class ExpenseVoucherService {

    private final ExpenseVoucherRepository repo;
    private final BranchAccessService branchAccessService;
    private final BranchRepository branchRepository;
    private final VoucherSequenceService voucherSequenceService;

    public ExpenseVoucherService(ExpenseVoucherRepository repo,
                                 BranchAccessService branchAccessService,
                                 BranchRepository branchRepository,
                                 VoucherSequenceService voucherSequenceService) {
        this.repo = repo;
        this.branchAccessService = branchAccessService;
        this.branchRepository = branchRepository;
        this.voucherSequenceService = voucherSequenceService;
    }

    public List<ExpenseVoucher> getAll() {
        Long branchId = branchAccessService.getCurrentUserBranchId();
        if (branchId != null) {
            return repo.findAllActiveByBranch(branchId);
        }
        return repo.findAllActive();
    }

    public ExpenseVoucher getById(Long id) {
        return repo.findById(id).orElseThrow(() -> new RuntimeException("Expense voucher not found: " + id));
    }

    @Transactional
    public ExpenseVoucher create(ExpenseVoucherRequest req) {
        ExpenseVoucher voucher = new ExpenseVoucher();

        // Resolve branch
        Branch branch = resolveBranch(req.getBranchId());
        voucher.setBranch(branch);

        LocalDate date = req.getDate() != null ? req.getDate() : LocalDate.now();

        voucher.setVoucherNumber(voucherSequenceService.nextGlobalVoucherNumber("EV", date));
        voucher.setDate(date);
        voucher.setVendor(req.getVendor());
        voucher.setVendorId(req.getVendorId());
        voucher.setPaymentMode(req.getPaymentMode());
        voucher.setPaymentAccountId(req.getPaymentAccountId());
        voucher.setNarration(req.getNarration());
        voucher.setStatus(req.getStatus() != null ? req.getStatus() : "Draft");

        if (req.getLines() != null) {
            for (ExpenseVoucherLineRequest lr : req.getLines()) {
                ExpenseVoucherLine line = buildLine(lr);
                voucher.addLine(line);
            }
        }

        voucher.recalcTotals();
        return repo.save(voucher);
    }

    @Transactional
    public ExpenseVoucher update(Long id, ExpenseVoucherRequest req) {
        ExpenseVoucher voucher = getById(id);

        Branch branch = resolveBranch(req.getBranchId());
        voucher.setBranch(branch);
        voucher.setDate(req.getDate() != null ? req.getDate() : voucher.getDate());
        voucher.setVendor(req.getVendor());
        voucher.setVendorId(req.getVendorId());
        voucher.setPaymentMode(req.getPaymentMode());
        voucher.setPaymentAccountId(req.getPaymentAccountId());
        voucher.setNarration(req.getNarration());
        if (req.getStatus() != null) voucher.setStatus(req.getStatus());

        voucher.getLines().clear();
        if (req.getLines() != null) {
            for (ExpenseVoucherLineRequest lr : req.getLines()) {
                ExpenseVoucherLine line = buildLine(lr);
                voucher.addLine(line);
            }
        }

        voucher.recalcTotals();
        return repo.save(voucher);
    }

    @Transactional
    public void delete(Long id) {
        ExpenseVoucher voucher = getById(id);
        voucher.setActive(false);
        repo.save(voucher);
    }

    private Branch resolveBranch(Long branchId) {
        if (branchId != null) {
            return branchRepository.findById(branchId).orElse(null);
        }
        return branchAccessService.getCurrentUserBranchOrNull();
    }

    private ExpenseVoucherLine buildLine(ExpenseVoucherLineRequest lr) {
        ExpenseVoucherLine line = new ExpenseVoucherLine();
        line.setGlAccountId(lr.getGlAccountId());
        line.setGlAccountName(lr.getGlAccountName());
        line.setDescription(lr.getDescription());
        line.setCategory(lr.getCategory());
        line.setCostCenter(lr.getCostCenter());
        line.setAmount(lr.getAmount());
        line.setTaxRate(lr.getTaxRate());
        line.recalc();
        return line;
    }
}
