package com.billbull.backend.pos.counter;

import com.billbull.backend.pos.terminal.PosTerminal;
import com.billbull.backend.pos.terminal.PosTerminalRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * One-time startup migration: creates PosCounter entities from terminal.counter_name strings
 * and wires terminal.counter_id back to the new entities. Idempotent — skips if counters
 * already exist for a branch.
 */
@Component
public class PosCounterBackfillRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PosCounterBackfillRunner.class);

    private final PosTerminalRepository terminalRepo;
    private final PosCounterRepository counterRepo;

    public PosCounterBackfillRunner(PosTerminalRepository terminalRepo, PosCounterRepository counterRepo) {
        this.terminalRepo = terminalRepo;
        this.counterRepo = counterRepo;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        List<PosTerminal> terminals = terminalRepo.findAll();
        if (terminals.isEmpty()) return;

        // Group terminals by branchId
        Map<Long, List<PosTerminal>> byBranch = new HashMap<>();
        for (PosTerminal t : terminals) {
            if (t.getBranchId() == null) continue;
            byBranch.computeIfAbsent(t.getBranchId(), k -> new java.util.ArrayList<>()).add(t);
        }

        for (Map.Entry<Long, List<PosTerminal>> entry : byBranch.entrySet()) {
            Long branchId = entry.getKey();
            List<PosTerminal> branchTerminals = entry.getValue();

            // Skip if this branch already has counters (idempotent)
            if (!counterRepo.findByBranchIdOrderByDisplayOrderAscCounterNameAsc(branchId).isEmpty()) continue;

            // Determine branch name from first terminal
            String branchName = branchTerminals.stream()
                    .map(PosTerminal::getBranchName)
                    .filter(n -> n != null && !n.isBlank())
                    .findFirst().orElse("Branch " + branchId);

            // Collect distinct non-blank counter names
            Map<String, PosCounter> createdCounters = new HashMap<>();
            int displayOrder = 1;

            for (PosTerminal terminal : branchTerminals) {
                if (terminal.getCounterId() != null) continue; // already linked

                String counterName = terminal.getCounterName();
                if (counterName == null || counterName.isBlank()) {
                    counterName = "Counter 1";
                }

                if (!createdCounters.containsKey(counterName)) {
                    PosCounter counter = new PosCounter();
                    counter.setBranchId(branchId);
                    counter.setBranchName(branchName);
                    counter.setCounterCode("CTR-" + String.format("%03d", displayOrder));
                    counter.setCounterName(counterName);
                    counter.setStatus(PosCounterStatus.ACTIVE);
                    counter.setDisplayOrder(displayOrder++);
                    counter = counterRepo.save(counter);
                    createdCounters.put(counterName, counter);
                    log.info("Backfill: created counter '{}' (id={}) for branch {}", counterName, counter.getId(), branchId);
                }

                terminal.setCounterId(createdCounters.get(counterName).getId());
                terminalRepo.save(terminal);
            }
        }
    }
}
