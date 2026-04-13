package com.billbull.backend.financials.generalledger.postingengine;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PostingRuleRepository extends JpaRepository<PostingRule, Long> {

    List<PostingRule> findByTransactionTypeAndIsActiveTrueOrderBySortOrderAsc(String transactionType);

    List<PostingRule> findByTransactionType(String transactionType);

    List<PostingRule> findAllByOrderByTransactionTypeAscSortOrderAsc();
}
