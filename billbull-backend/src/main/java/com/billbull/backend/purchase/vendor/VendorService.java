package com.billbull.backend.purchase.vendor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional
public class VendorService {

    private final VendorRepository repo;
    private final com.billbull.backend.purchase.lpo.LpoRepository lpoRepo;

    private final com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository invRepo;

    public VendorService(VendorRepository repo,
            com.billbull.backend.purchase.lpo.LpoRepository lpoRepo,
            com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository invRepo) {
        this.repo = repo;
        this.lpoRepo = lpoRepo;
        this.invRepo = invRepo;
    }

    // -------------------------
    // CREATE
    // -------------------------
    public Vendor create(VendorRequest req, boolean isDraft) {
        Vendor v = new Vendor();
        map(req, v);

        v.setCode(generateCode());
        v.setStatus(isDraft ? "Draft" : "Active");

        return repo.save(v);
    }

    // -------------------------
    // UPDATE
    // -------------------------
    public Vendor update(Long id, VendorRequest req) {
        Vendor v = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Vendor not found"));

        map(req, v);
        return repo.save(v);
    }

    // -------------------------
    // LIST
    // -------------------------
    public List<VendorListResponse> list() {
        return repo.findByIsActiveTrue()
                .stream()
                .map(v -> new VendorListResponse(
                        v.getId(),
                        v.getCode(),
                        v.getName(),
                        v.getEmail(),
                        v.getCategory(),
                        v.getContact(),
                        v.getLeadTime(),
                        v.getRating(),
                        v.getBalance(),
                        v.getStatus(),
                        v.getIsPreferred()))
                .toList();
    }

    // -------------------------
    // DELETE (SOFT)
    // -------------------------
    public void delete(Long id) {
        Vendor v = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Vendor not found"));

        // Check LPO usage
        if (lpoRepo.existsByVendorCode(v.getCode())) {
            throw new IllegalStateException("Cannot delete vendor. Used in LPOs. Consider deactivating instead.");
        }

        // Check Invoice usage (by Name as per entity definition)
        if (invRepo.existsByVendorName(v.getName())) {
            throw new IllegalStateException(
                    "Cannot delete vendor. Used in Purchase Invoices. Consider deactivating instead.");
        }

        v.setActive(false);
        repo.save(v);
    }

    // -------------------------
    // MAPPERS
    // -------------------------
    private void map(VendorRequest r, Vendor v) {
        v.setName(r.getName());
        v.setStatus(r.getStatus());
        v.setVendorGroup(r.getVendorGroup());
        v.setVendorType(r.getVendorType());
        v.setCategory(r.getCategory());
        v.setCountry(r.getCountry());
        v.setIsPreferred(r.getIsPreferred());

        v.setEmail(r.getEmail());
        v.setContact(r.getContact());

        v.setPrefComm(r.getPrefComm());
        v.setPriority(r.getPriority());

        v.setCurrency(r.getCurrency());
        v.setPayTerms(r.getPayTerms());
        v.setBalType(r.getBalType());
        v.setPayPref(r.getPayPref());

        v.setOpeningBalance(r.getOpeningBalance());
    }

    private String generateCode() {
        return "VEN-" + System.currentTimeMillis();
    }
}
