package com.billbull.backend.financials.settlement;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;

@Service
public class CardSettlementService {

    private final CardSettlementRepository cardSettlementRepository;
    private final PostingEngineService postingEngineService;

    public CardSettlementService(CardSettlementRepository cardSettlementRepository,
            PostingEngineService postingEngineService) {
        this.cardSettlementRepository = cardSettlementRepository;
        this.postingEngineService = postingEngineService;
    }

    public List<CardSettlement> getAllSettlements() {
        return cardSettlementRepository.findAll();
    }

    public CardSettlement getSettlement(Long id) {
        return cardSettlementRepository.findById(id)
                .orElseThrow(
                        () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Card settlement not found: " + id));
    }

    @Transactional
    public CardSettlement createSettlement(CardSettlement settlement) {
        settlement.setStatus("DRAFT");
        return cardSettlementRepository.save(settlement);
    }

    @Transactional
    public CardSettlement updateStatus(Long id, String status) {
        CardSettlement prev = getSettlement(id);

        if ("POSTED".equalsIgnoreCase(prev.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Posted settlements cannot be modified.");
        }

        prev.setStatus(status.toUpperCase());
        CardSettlement saved = cardSettlementRepository.save(prev);

        if ("POSTED".equalsIgnoreCase(status)) {
            postingEngineService.createJournalFromCardSettlement(saved);
        }

        return saved;
    }
}
