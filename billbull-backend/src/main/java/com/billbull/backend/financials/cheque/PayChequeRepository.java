package com.billbull.backend.financials.cheque;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface PayChequeRepository extends JpaRepository<PayCheque, Long> {

    @Query("SELECT c FROM PayCheque c JOIN FETCH c.chequeBook LEFT JOIN FETCH c.branch b "
            + "WHERE c.isActive = true AND (:allBranches = true OR b.id IN :branchIds) "
            + "ORDER BY c.chequeDate DESC, c.id DESC")
    List<PayCheque> findAllScoped(@Param("allBranches") boolean allBranches,
                                  @Param("branchIds") Collection<Long> branchIds);

    @Query("SELECT c FROM PayCheque c JOIN FETCH c.chequeBook LEFT JOIN FETCH c.branch WHERE c.id = :id")
    Optional<PayCheque> findByIdWithBook(@Param("id") Long id);

    /** [bookId, count] of the book's cheques in the given states. */
    @Query("SELECT c.chequeBook.id, COUNT(c) FROM PayCheque c WHERE c.isActive = true "
            + "AND c.status IN :statuses GROUP BY c.chequeBook.id")
    List<Object[]> countByBookAndStatusIn(@Param("statuses") Collection<PayChequeStatus> statuses);

    @Query("SELECT COUNT(c) > 0 FROM PayCheque c WHERE c.isActive = true "
            + "AND c.status <> com.billbull.backend.financials.cheque.PayChequeStatus.CANCELLED "
            + "AND c.chequeBook.id = :bookId AND c.chequeNumber = :number "
            + "AND (:excludeId IS NULL OR c.id <> :excludeId)")
    boolean existsLiveNumber(@Param("bookId") Long bookId,
                             @Param("number") String number,
                             @Param("excludeId") Long excludeId);
}
