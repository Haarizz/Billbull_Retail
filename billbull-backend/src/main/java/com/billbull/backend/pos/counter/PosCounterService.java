package com.billbull.backend.pos.counter;

import com.billbull.backend.pos.terminal.PosTerminalRepository;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.Branch;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@Service
public class PosCounterService {

    private final PosCounterRepository repo;
    private final PosTerminalRepository terminalRepo;
    private final BranchAccessService branchAccessService;

    public PosCounterService(PosCounterRepository repo,
                             PosTerminalRepository terminalRepo,
                             BranchAccessService branchAccessService) {
        this.repo = repo;
        this.terminalRepo = terminalRepo;
        this.branchAccessService = branchAccessService;
    }

    @Transactional(readOnly = true)
    public List<PosCounter> listForBranch(Long branchId) {
        return repo.findByBranchIdOrderByDisplayOrderAscCounterNameAsc(branchId);
    }

    @Transactional(readOnly = true)
    public List<PosCounter> listActiveForBranch(Long branchId) {
        return repo.findByBranchIdAndStatusOrderByDisplayOrderAsc(branchId, PosCounterStatus.ACTIVE);
    }

    @Transactional(readOnly = true)
    public PosCounter getById(Long id) {
        return repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Counter not found: " + id));
    }

    @Transactional
    public PosCounter create(Long branchId, String branchName, String counterCode, String counterName,
                              String description, String defaultCashDrawer, String defaultReceiptPrinter,
                              Integer displayOrder) {
        String code = counterCode != null && !counterCode.isBlank()
                ? counterCode.trim().toUpperCase()
                : generateNextCode(branchId);

        if (repo.existsByBranchIdAndCounterCode(branchId, code)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Counter code '" + code + "' already exists for this branch.");
        }

        PosCounter counter = new PosCounter();
        counter.setBranchId(branchId);
        counter.setBranchName(branchName);
        counter.setCounterCode(code);
        counter.setCounterName(counterName.trim());
        counter.setDescription(description);
        counter.setDefaultCashDrawer(defaultCashDrawer);
        counter.setDefaultReceiptPrinter(defaultReceiptPrinter);
        counter.setDisplayOrder(displayOrder != null ? displayOrder : 0);
        counter.setStatus(PosCounterStatus.ACTIVE);
        return repo.save(counter);
    }

    @Transactional
    public PosCounter update(Long id, String counterName, String description,
                              String defaultCashDrawer, String defaultReceiptPrinter, Integer displayOrder) {
        PosCounter counter = getById(id);
        if (counterName != null && !counterName.isBlank()) counter.setCounterName(counterName.trim());
        if (description != null) counter.setDescription(description);
        if (defaultCashDrawer != null) counter.setDefaultCashDrawer(defaultCashDrawer);
        if (defaultReceiptPrinter != null) counter.setDefaultReceiptPrinter(defaultReceiptPrinter);
        if (displayOrder != null) counter.setDisplayOrder(displayOrder);
        return repo.save(counter);
    }

    @Transactional
    public PosCounter setStatus(Long id, PosCounterStatus status) {
        PosCounter counter = getById(id);
        if (status == PosCounterStatus.INACTIVE || status == PosCounterStatus.MAINTENANCE) {
            long activeTerminals = terminalRepo.countByCounterIdAndStatusIn(id);
            if (activeTerminals > 0) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Cannot deactivate counter: " + activeTerminals + " terminal(s) are active at this counter.");
            }
        }
        counter.setStatus(status);
        return repo.save(counter);
    }

    @Transactional
    public void delete(Long id) {
        PosCounter counter = getById(id);
        long terminalCount = terminalRepo.countByCounterId(id);
        if (terminalCount > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Cannot delete counter: " + terminalCount + " terminal(s) reference this counter.");
        }
        counter.setActive(false);
        counter.setStatus(PosCounterStatus.INACTIVE);
        repo.save(counter);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getWithMetrics(Long id) {
        PosCounter counter = getById(id);
        long totalTerminals = terminalRepo.countByCounterId(id);
        long activeTerminals = terminalRepo.countByCounterIdAndStatusIn(id);
        return Map.of(
                "counter", counter,
                "totalTerminals", totalTerminals,
                "activeTerminals", activeTerminals
        );
    }

    private String generateNextCode(Long branchId) {
        String maxCode = repo.findMaxCounterCodeByBranchId(branchId);
        if (maxCode == null) return "CTR-001";
        try {
            int seq = Integer.parseInt(maxCode.replace("CTR-", ""));
            return String.format("CTR-%03d", seq + 1);
        } catch (NumberFormatException e) {
            long count = repo.findByBranchIdOrderByDisplayOrderAscCounterNameAsc(branchId).size();
            return String.format("CTR-%03d", count + 1);
        }
    }
}
