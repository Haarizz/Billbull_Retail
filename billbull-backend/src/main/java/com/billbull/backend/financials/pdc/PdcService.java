package com.billbull.backend.financials.pdc;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;

@Service
public class PdcService {

    private final PdcRepository pdcRepository;
    private final PostingEngineService postingEngineService;

    public PdcService(PdcRepository pdcRepository, PostingEngineService postingEngineService) {
        this.pdcRepository = pdcRepository;
        this.postingEngineService = postingEngineService;
    }

    public List<PdcEntry> getAllPdcs() {
        return pdcRepository.findAll();
    }

    public PdcEntry getPdc(Long id) {
        return pdcRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "PDC not found: " + id));
    }

    @Transactional
    public PdcEntry receivePdc(PdcEntry pdc) {
        pdc.setStatus(PdcStatus.RECEIVED);
        PdcEntry saved = pdcRepository.save(pdc);

        postingEngineService.createJournalFromPdcTransition(saved, null, PdcStatus.RECEIVED);
        return saved;
    }

    @Transactional
    public PdcEntry updateStatus(Long id, PdcStatus newStatus) {
        PdcEntry pdc = getPdc(id);
        PdcStatus oldStatus = pdc.getStatus();

        if (oldStatus == newStatus) {
            return pdc;
        }

        pdc.setStatus(newStatus);
        PdcEntry saved = pdcRepository.save(pdc);

        postingEngineService.createJournalFromPdcTransition(saved, oldStatus, newStatus);

        return saved;
    }
}
