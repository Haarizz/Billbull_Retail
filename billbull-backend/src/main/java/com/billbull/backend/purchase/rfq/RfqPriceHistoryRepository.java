package com.billbull.backend.purchase.rfq;

import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import com.billbull.backend.purchase.lpo.LpoItem;

/**
 * Read-only lookups for the "previous quotations" and "purchase history" panels: earlier
 * vendor offers for the same product on other RFQs, and LPO lines for the same product.
 */
public interface RfqPriceHistoryRepository extends Repository<LpoItem, Long> {

    @Query("""
            select o from RfqOffer o
              join fetch o.rfqVendor v
              join fetch v.rfq r
            where o.rfqItemId in (select i.id from RfqItem i where i.productId = :productId)
              and r.id <> :excludeRfqId
              and r.isActive = true
              and v.responseStatus in :responded
              and o.unitPrice > 0
            order by v.submittedAt desc, o.id desc
            """)
    List<RfqOffer> findPreviousOffers(@Param("productId") Long productId,
                                      @Param("excludeRfqId") Long excludeRfqId,
                                      @Param("responded") List<RfqVendorResponseStatus> responded,
                                      Pageable pageable);

    @Query("""
            select li from LpoItem li
              join fetch li.lpo l
            where li.product.id = :productId
            order by l.lpoDate desc, l.id desc
            """)
    List<LpoItem> findRecentLpoLines(@Param("productId") Long productId, Pageable pageable);

    /**
     * [vendorId, vendorName, productId, lineCount, lastLpoDate, totalQty, avgUnitPrice] for
     * non-cancelled LPOs in scope.
     */
    @Query("""
            select l.vendorId, max(l.vendorName), li.product.id, count(li), max(l.lpoDate),
                   sum(coalesce(li.quantity, 0)), avg(li.unitPrice)
            from LpoItem li join li.lpo l
            where li.product.id in :productIds
              and l.vendorId is not null
              and (l.status is null or l.status <> com.billbull.backend.purchase.lpo.LpoStatus.CANCELLED)
              and (:allBranches = true or l.branchId in :branchIds)
            group by l.vendorId, li.product.id
            """)
    List<Object[]> lpoSuppliersOf(@Param("productIds") List<Long> productIds,
                                  @Param("allBranches") boolean allBranches,
                                  @Param("branchIds") java.util.Collection<Long> branchIds);

    /** [vendorId, vendorName, productId, offerCount, lastSubmittedAt, avgUnitPrice] from earlier RFQ quotations. */
    @Query("""
            select v.vendorId, max(v.vendorName), i.productId, count(o), max(v.submittedAt), avg(o.unitPrice)
            from RfqOffer o join o.rfqVendor v join v.rfq r, RfqItem i
            where i.id = o.rfqItemId
              and i.productId in :productIds
              and r.isActive = true
              and v.responseStatus in :responded
              and o.unitPrice > 0
            group by v.vendorId, i.productId
            """)
    List<Object[]> quotingVendorsOf(@Param("productIds") List<Long> productIds,
                                    @Param("responded") List<RfqVendorResponseStatus> responded);

    /** [vendorId, invitations, answers] over RFQs that were actually sent (not drafts). */
    @Query("""
            select v.vendorId, count(v),
                   sum(case when v.responseStatus in :answered then 1 else 0 end)
            from RfqVendor v join v.rfq r
            where v.vendorId in :vendorIds
              and r.isActive = true
              and r.status <> com.billbull.backend.purchase.rfq.RfqStatus.DRAFT
            group by v.vendorId
            """)
    List<Object[]> responseStatsOf(@Param("vendorIds") java.util.Collection<Long> vendorIds,
                                   @Param("answered") List<RfqVendorResponseStatus> answered);
}
