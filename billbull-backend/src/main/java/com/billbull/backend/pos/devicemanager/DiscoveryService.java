package com.billbull.backend.pos.devicemanager;

import com.billbull.backend.pos.device.PosDeviceType;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Ingests hardware candidates a Local Device Agent has enumerated (USB/Bluetooth/Serial/
 * Network/Windows-printer-queue) but that aren't yet matched to a registered {@code PosDevice}.
 * Deliberately does not attempt to match a candidate against an already-registered device by
 * inferring identity (e.g. "this raw USB string is probably printer #12") — there's no reliable
 * matching rule defined yet, and guessing wrong would silently miscategorize real hardware. A
 * candidate only leaves NEW via an explicit operator action (ignore, or — in a later phase once
 * the Device Dashboard exists — register), never automatically.
 * See docs/pos-device-architecture-specification-v2-2026-06-30.md §11 (Phase C).
 */
@Service
public class DiscoveryService {

    private final PosDiscoveredDeviceRepository repo;

    public DiscoveryService(PosDiscoveredDeviceRepository repo) {
        this.repo = repo;
    }

    /** Upserts one reported candidate, keyed by (agentIdentifier, rawIdentifier). Idempotent —
     *  re-reporting the same candidate on every discovery cycle just refreshes lastSeenAt. */
    public PosDiscoveredDevice ingest(String agentIdentifier, CandidateRequest candidate) {
        if (agentIdentifier == null || agentIdentifier.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "agentIdentifier is required.");
        }
        if (candidate == null || candidate.rawIdentifier() == null || candidate.rawIdentifier().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "rawIdentifier is required.");
        }
        if (candidate.discoveryMethod() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "discoveryMethod is required.");
        }

        Optional<PosDiscoveredDevice> existing =
                repo.findByAgentIdentifierAndRawIdentifier(agentIdentifier, candidate.rawIdentifier());
        PosDiscoveredDevice device = existing.orElseGet(PosDiscoveredDevice::new);
        boolean isNew = existing.isEmpty();

        device.setAgentIdentifier(agentIdentifier);
        device.setRawIdentifier(candidate.rawIdentifier());
        device.setDiscoveryMethod(candidate.discoveryMethod());
        device.setSuggestedDeviceType(candidate.suggestedDeviceType());
        device.setLastSeenAt(LocalDateTime.now());
        if (isNew) {
            device.setFirstSeenAt(LocalDateTime.now());
            device.setStatus(DiscoveredDeviceStatus.NEW);
        }
        // Re-discovery of a candidate already IGNORED/REGISTERED does not resurrect it to NEW —
        // an operator's prior decision about this candidate stands until they change it.
        return repo.save(device);
    }

    public List<PosDiscoveredDevice> ingestBatch(String agentIdentifier, List<CandidateRequest> candidates) {
        return candidates == null ? List.of() : candidates.stream().map(c -> ingest(agentIdentifier, c)).toList();
    }

    public List<PosDiscoveredDevice> listAwaitingRegistration() {
        return repo.findByStatusOrderByLastSeenAtDesc(DiscoveredDeviceStatus.NEW);
    }

    public PosDiscoveredDevice ignore(Long id) {
        PosDiscoveredDevice device = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Discovered device not found: " + id));
        device.setStatus(DiscoveredDeviceStatus.IGNORED);
        return repo.save(device);
    }

    public record CandidateRequest(
            DiscoveryMethod discoveryMethod,
            String rawIdentifier,
            PosDeviceType suggestedDeviceType
    ) {}
}
