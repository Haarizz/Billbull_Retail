package com.billbull.backend.pos.search;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.inventory.batch.BatchMaster;
import com.billbull.backend.inventory.batch.BatchMasterRepository;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductAggregateResponse;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.product.ProductService;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;

/**
 * Unified POS search resolver. Maps one scanned/typed value to the single most
 * relevant action for the cashier. Resolution order (first hit wins):
 *
 * <ol>
 *   <li>Exact barcode ({@code product_barcodes})</li>
 *   <li>Exact batch number ({@code batch_master}) — pins that unit on the cart line</li>
 *   <li>Exact product code / SKU</li>
 *   <li>Exact customer code / mobile / phone / email</li>
 *   <li>Otherwise {@code NONE} — the frontend falls back to filtering the grid</li>
 * </ol>
 */
@Service
public class PosSearchService {

    private final ProductService productService;
    private final ProductRepository productRepository;
    private final BatchMasterRepository batchMasterRepository;
    private final CustomerRepository customerRepository;

    public PosSearchService(ProductService productService,
                            ProductRepository productRepository,
                            BatchMasterRepository batchMasterRepository,
                            CustomerRepository customerRepository) {
        this.productService = productService;
        this.productRepository = productRepository;
        this.batchMasterRepository = batchMasterRepository;
        this.customerRepository = customerRepository;
    }

    @Transactional(readOnly = true)
    public PosResolveResponse resolve(String query) {
        String q = query == null ? "" : query.trim();
        if (q.isEmpty()) {
            return PosResolveResponse.none();
        }

        // 1. Exact barcode → product, no pinned batch.
        List<ProductAggregateResponse> byBarcode = productService.searchProductsByBarcode(q);
        if (byBarcode != null && !byBarcode.isEmpty()) {
            return PosResolveResponse.product(byBarcode.get(0), null);
        }

        // 2. Exact batch number → product + pin the scanned batch unit.
        Optional<BatchMaster> batch = batchMasterRepository.findFirstByBatchNumberIgnoreCase(q);
        if (batch.isPresent()) {
            BatchMaster bm = batch.get();
            ProductAggregateResponse product = loadActiveProduct(bm.getProductId());
            if (product != null) {
                return PosResolveResponse.product(product, bm.getBatchNumber());
            }
        }

        // 3. Exact product code / SKU.
        Product byCode = productRepository.findFirstByCodeIgnoreCaseAndIsActiveTrue(q)
                .or(() -> productRepository.findFirstBySkuIgnoreCaseAndIsActiveTrue(q))
                .orElse(null);
        if (byCode != null) {
            ProductAggregateResponse product = loadActiveProduct(byCode.getId());
            if (product != null) {
                return PosResolveResponse.product(product, null);
            }
        }

        // 4. Exact customer code / mobile / phone / email.
        Optional<Customer> customer = customerRepository
                .findFirstByCodeIgnoreCaseOrMobileIgnoreCaseOrPhoneIgnoreCaseOrEmailIgnoreCase(q, q, q, q);
        if (customer.isPresent()) {
            return PosResolveResponse.customer(toCustomerMatch(customer.get()));
        }

        // 5. No exact match — let the grid filter handle it.
        return PosResolveResponse.none();
    }

    private ProductAggregateResponse loadActiveProduct(Long productId) {
        if (productId == null) {
            return null;
        }
        try {
            return productService.getById(productId);
        } catch (RuntimeException ex) {
            // Product inactive or deleted — treat as no match.
            return null;
        }
    }

    private PosResolveResponse.CustomerMatch toCustomerMatch(Customer c) {
        PosResolveResponse.CustomerMatch match = new PosResolveResponse.CustomerMatch();
        match.setId(c.getId());
        match.setCode(c.getCode());
        match.setName(c.getName());
        match.setMobile(c.getMobile());
        match.setPhone(c.getPhone());
        match.setEmail(c.getEmail());
        return match;
    }
}
