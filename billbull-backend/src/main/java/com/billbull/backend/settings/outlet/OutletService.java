package com.billbull.backend.settings.outlet;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class OutletService {

    private final OutletRepository outletRepo;

    public OutletService(OutletRepository outletRepo) {
        this.outletRepo = outletRepo;
    }

    public List<Outlet> getAll() {
        return outletRepo.findByIsActiveTrue();
    }

    public List<Outlet> getByBranch(Long branchId) {
        return outletRepo.findByBranchIdAndIsActiveTrue(branchId);
    }

    public Optional<Outlet> findById(Long id) {
        return outletRepo.findById(id);
    }

    @Transactional
    public Outlet create(Long branchId, Outlet outlet) {
        outlet.setBranchId(branchId);
        return outletRepo.save(outlet);
    }

    @Transactional
    public Outlet save(Outlet outlet) {
        return outletRepo.save(outlet);
    }

    @Transactional
    public void deactivate(Long id) {
        outletRepo.findById(id).ifPresent(o -> {
            o.setIsActive(false);
            outletRepo.save(o);
        });
    }
}
