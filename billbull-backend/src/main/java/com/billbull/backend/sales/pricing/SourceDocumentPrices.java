package com.billbull.backend.sales.pricing;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.sales.pricing.PricingModels.CarriedPrice;
import com.billbull.backend.sales.proforma.ProformaRepository;
import com.billbull.backend.sales.quotation.QuotationRepository;
import com.billbull.backend.sales.salesorder.SalesOrderRepository;

/**
 * The priced lines of the documents a sales document was converted from, by document number, for
 * {@link PricingResolutionService#applyToLines}: a line that carries such a line's price unchanged
 * is priced by that (authoritative) document and is not re-resolved or flagged as an override.
 *
 * <p>Unknown numbers yield nothing; a lookup that fails yields nothing too, so the worst case is the
 * existing behaviour (the line is resolved and, if different, flagged as a manual price).
 */
@Component
public class SourceDocumentPrices {

    private final QuotationRepository quotationRepository;
    private final SalesOrderRepository salesOrderRepository;
    private final ProformaRepository proformaRepository;

    public SourceDocumentPrices(QuotationRepository quotationRepository,
                                SalesOrderRepository salesOrderRepository,
                                ProformaRepository proformaRepository) {
        this.quotationRepository = quotationRepository;
        this.salesOrderRepository = salesOrderRepository;
        this.proformaRepository = proformaRepository;
    }

    @Transactional(readOnly = true)
    public List<CarriedPrice> forDocuments(String quotationNo, String salesOrderNo, String proformaNo) {
        List<CarriedPrice> out = new ArrayList<>();
        if (has(quotationNo)) {
            out.addAll(safe(() -> quotationRepository.findByQtnNo(quotationNo.trim())
                    .map(q -> CarriedPrice.of(q.getItems())).orElse(List.of())));
        }
        if (has(salesOrderNo)) {
            out.addAll(safe(() -> salesOrderRepository.findBySoNumber(salesOrderNo.trim())
                    .map(o -> CarriedPrice.of(o.getItems())).orElse(List.of())));
        }
        if (has(proformaNo)) {
            out.addAll(safe(() -> proformaRepository.findFirstByPiNumberOrderByIdDesc(proformaNo.trim())
                    .map(p -> CarriedPrice.of(p.getItems())).orElse(List.of())));
        }
        return out;
    }

    private static boolean has(String s) {
        return s != null && !s.isBlank();
    }

    private static List<CarriedPrice> safe(Supplier<List<CarriedPrice>> lookup) {
        try {
            return lookup.get();
        } catch (RuntimeException ex) {
            return List.of();
        }
    }
}
