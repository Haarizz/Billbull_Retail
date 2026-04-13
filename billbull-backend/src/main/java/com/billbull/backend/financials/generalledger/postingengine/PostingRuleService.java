package com.billbull.backend.financials.generalledger.postingengine;

import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PostingRuleService {

    private final PostingRuleRepository repository;

    public PostingRuleService(PostingRuleRepository repository) {
        this.repository = repository;
    }

    public List<PostingRule> getAllPostingRules() {
        return repository.findAllByOrderByTransactionTypeAscSortOrderAsc();
    }

    public List<PostingRule> getActiveRulesForTransactionType(String transactionType) {
        return repository.findByTransactionTypeAndIsActiveTrueOrderBySortOrderAsc(transactionType);
    }

    public List<PostingRule> getRulesByTransactionType(String transactionType) {
        return repository.findByTransactionType(transactionType);
    }

    public PostingRule createPostingRule(PostingRule rule) {
        return repository.save(rule);
    }

    public PostingRule updatePostingRule(Long id, PostingRule updated) {
        PostingRule existing = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Posting Rule not found: " + id));

        existing.setTransactionType(updated.getTransactionType());
        existing.setLineLabel(updated.getLineLabel());
        existing.setDebitAccountCode(updated.getDebitAccountCode());
        existing.setCreditAccountCode(updated.getCreditAccountCode());
        existing.setDescription(updated.getDescription());
        existing.setIsActive(updated.getIsActive());
        existing.setSortOrder(updated.getSortOrder());

        return repository.save(existing);
    }

    public void deletePostingRule(Long id) {
        if (!repository.existsById(id)) {
            throw new RuntimeException("Posting Rule not found: " + id);
        }
        repository.deleteById(id);
    }
}
