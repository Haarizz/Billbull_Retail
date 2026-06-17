package com.billbull.backend.pos.terminal;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface PosTerminalRepository extends JpaRepository<PosTerminal, Long> {
    Optional<PosTerminal> findByDeviceFingerprint(String deviceFingerprint);
    Optional<PosTerminal> findByTerminalId(String terminalId);
    List<PosTerminal> findByBranchIdAndStatus(Long branchId, PosTerminalStatus status);
    int countByBranchIdAndStatus(Long branchId, PosTerminalStatus status);
}
