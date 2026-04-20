package com.billbull.backend.inventory.stocktransfer;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.*;
import com.billbull.backend.inventory.warehouse.WarehouseStockService;
import com.billbull.backend.purchase.stockmovement.StockMovement;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.purchase.stockmovement.StockSourceType;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Service
@Transactional
public class StockTransferService {

    private final StockTransferRepository repository;
    private final ProductRepository productRepository;
    private final WarehouseRepository warehouseRepository;
    private final ZoneRepository zoneRepository;
    private final LocatorRepository locatorRepository;
    private final BinRepository binRepository;
    private final StockMovementRepository stockMovementRepository;
    private final WarehouseStockService stockService;

    public StockTransferService(StockTransferRepository repository,
            ProductRepository productRepository,
            WarehouseRepository warehouseRepository,
            ZoneRepository zoneRepository,
            LocatorRepository locatorRepository,
            BinRepository binRepository,
            StockMovementRepository stockMovementRepository,
            WarehouseStockService stockService) {
        this.repository = repository;
        this.productRepository = productRepository;
        this.warehouseRepository = warehouseRepository;
        this.zoneRepository = zoneRepository;
        this.locatorRepository = locatorRepository;
        this.binRepository = binRepository;
        this.stockMovementRepository = stockMovementRepository;
        this.stockService = stockService;
    }

    public List<StockTransferResponse> list() {
        return repository.findAll().stream().map(this::toResponse).toList();
    }

    public StockTransferResponse get(Long id) {
        return toResponse(getEntity(id));
    }

    public StockTransferResponse create(StockTransferRequest req) {
        StockTransfer st = new StockTransfer();
        mapToEntity(req, st);
        return toResponse(repository.save(st));
    }

    public StockTransferResponse update(Long id, StockTransferRequest req) {
        StockTransfer st = getEntity(id);
        if (st.getStatus() != StockTransferStatus.DRAFT) {
            throw new IllegalStateException("Only DRAFT transfers can be modified");
        }
        st.getItems().clear();
        mapToEntity(req, st);
        return toResponse(repository.save(st));
    }

    public void delete(Long id) {
        StockTransfer st = getEntity(id);
        if (st.getStatus() != StockTransferStatus.DRAFT) {
            throw new IllegalStateException("Only DRAFT transfers can be deleted");
        }
        repository.delete(st);
    }

    public StockTransferResponse requestApproval(Long id) {
        StockTransfer st = getEntity(id);
        if (st.getStatus() != StockTransferStatus.DRAFT) {
            throw new IllegalStateException("Only DRAFT transfers can be submitted for approval");
        }
        st.setStatus(StockTransferStatus.PENDING_APPROVAL);
        return toResponse(repository.save(st));
    }

    public StockTransferResponse cancel(Long id) {
        StockTransfer st = getEntity(id);
        if (st.getStatus() != StockTransferStatus.DRAFT && st.getStatus() != StockTransferStatus.PENDING_APPROVAL) {
            throw new IllegalStateException("Only DRAFT or PENDING_APPROVAL transfers can be cancelled");
        }
        st.setStatus(StockTransferStatus.CANCELLED);
        return toResponse(repository.save(st));
    }

    @Caching(evict = {
        @CacheEvict(value = "stockAvailability", allEntries = true),
        @CacheEvict(value = "productList", allEntries = true)
    })
    public StockTransferResponse markSent(Long id) {
        StockTransfer st = getEntity(id);
        if (st.getStatus() != StockTransferStatus.DRAFT && st.getStatus() != StockTransferStatus.PENDING_APPROVAL) {
            throw new IllegalStateException("Transfer is either already processed or cancelled");
        }

        // Logic: Create negative stock movements for source warehouse/bin
        for (StockTransferItem item : st.getItems()) {
            // Rule: Server-side validation
            BigDecimal available = stockService.getAvailableStock(st.getFromWarehouse().getId(),
                    item.getProduct().getId());
            if (available.compareTo(BigDecimal.valueOf(item.getQuantity())) < 0) {
                throw new IllegalStateException("Insufficient stock for product " + item.getProduct().getName());
            }

            StockMovement sm = new StockMovement();
            sm.setSourceType(StockSourceType.STOCK_TRANSFER_OUT);
            sm.setSourceId(st.getId());
            sm.setProductId(item.getProduct().getId());
            sm.setWarehouseId(st.getFromWarehouse().getId());
            sm.setBinId(st.getFromBin() != null ? st.getFromBin().getId() : null);
            sm.setQuantity(-item.getQuantity()); // Deduct
            sm.setMovementDate(LocalDate.now());
            sm.setReferenceNo(st.getTransferNo());
            sm.setBatchNumber(item.getBatchNumber());
            stockMovementRepository.save(sm);
        }

        st.setStatus(StockTransferStatus.SENT);
        st.setDispatchDate(LocalDate.now());
        return toResponse(repository.save(st));
    }

    @Caching(evict = {
        @CacheEvict(value = "stockAvailability", allEntries = true),
        @CacheEvict(value = "productList", allEntries = true)
    })
    public StockTransferResponse markReceived(Long id) {
        StockTransfer st = getEntity(id);
        if (st.getStatus() != StockTransferStatus.SENT) {
            throw new IllegalStateException("Only SENT transfers can be received. Current status: " + st.getStatus());
        }

        // Logic: Create positive stock movements for destination warehouse/bin
        for (StockTransferItem item : st.getItems()) {
            StockMovement sm = new StockMovement();
            sm.setSourceType(StockSourceType.STOCK_TRANSFER_IN);
            sm.setSourceId(st.getId());
            sm.setProductId(item.getProduct().getId());
            sm.setWarehouseId(st.getToWarehouse().getId());
            sm.setBinId(st.getToBin() != null ? st.getToBin().getId() : null);
            sm.setQuantity(item.getQuantity()); // Add
            sm.setMovementDate(LocalDate.now());
            sm.setReferenceNo(st.getTransferNo());
            sm.setBatchNumber(item.getBatchNumber());
            stockMovementRepository.save(sm);

            // Set received qty (default to requested qty)
            item.setReceivedQty(item.getQuantity());
        }

        st.setStatus(StockTransferStatus.RECEIVED);
        st.setArrivalDate(LocalDate.now());
        return toResponse(repository.save(st));
    }

    private StockTransfer getEntity(Long id) {
        return repository.findById(id).orElseThrow(() -> new RuntimeException("Stock Transfer not found"));
    }

    private void mapToEntity(StockTransferRequest req, StockTransfer st) {
        st.setTransferNo(req.transferNo);
        st.setReferenceDoc(req.referenceDoc);
        st.setTransferDate(req.transferDate);
        st.setReason(req.reason);
        st.setRequestedBy(req.requestedBy);
        st.setRemarks(req.remarks);
        st.setTransportMode(req.transportMode);
        st.setVehicleNo(req.vehicleNo);
        st.setDriverName(req.driverName);

        if (req.fromWarehouseId != null) {
            st.setFromWarehouse(warehouseRepository.findById(req.fromWarehouseId).orElse(null));
        }
        if (req.fromZoneId != null) {
            st.setFromZone(zoneRepository.findById(req.fromZoneId).orElse(null));
        }
        if (req.fromLocatorId != null) {
            st.setFromLocator(locatorRepository.findById(req.fromLocatorId).orElse(null));
        }
        if (req.fromBinId != null) {
            st.setFromBin(binRepository.findById(req.fromBinId).orElse(null));
        }

        if (req.toWarehouseId != null) {
            st.setToWarehouse(warehouseRepository.findById(req.toWarehouseId).orElse(null));
        }
        if (req.toZoneId != null) {
            st.setToZone(zoneRepository.findById(req.toZoneId).orElse(null));
        }
        if (req.toLocatorId != null) {
            st.setToLocator(locatorRepository.findById(req.toLocatorId).orElse(null));
        }
        if (req.toBinId != null) {
            st.setToBin(binRepository.findById(req.toBinId).orElse(null));
        }

        if (req.items != null) {
            for (StockTransferRequest.StockTransferItemRequest i : req.items) {
                Product product = productRepository.findById(i.productId)
                        .orElseThrow(() -> new RuntimeException("Product not found: " + i.productId));

                StockTransferItem item = new StockTransferItem();
                item.setStockTransfer(st);
                item.setProduct(product);
                item.setBatchNumber(i.batchNumber);
                item.setQuantity(i.quantity);
                item.setReceivedQty(0); // Initial
                item.setUom(i.uom);
                st.getItems().add(item);
            }
        }
    }

    private StockTransferResponse toResponse(StockTransfer st) {
        StockTransferResponse resp = new StockTransferResponse();
        resp.id = st.getId();
        resp.transferNo = st.getTransferNo();
        resp.referenceDoc = st.getReferenceDoc();
        resp.transferDate = st.getTransferDate();
        resp.reason = st.getReason();
        resp.requestedBy = st.getRequestedBy();
        resp.remarks = st.getRemarks();
        resp.status = st.getStatus();
        resp.transportMode = st.getTransportMode();
        resp.vehicleNo = st.getVehicleNo();
        resp.driverName = st.getDriverName();
        resp.dispatchDate = st.getDispatchDate();
        resp.arrivalDate = st.getArrivalDate();

        if (st.getFromWarehouse() != null) {
            resp.fromWarehouseId = st.getFromWarehouse().getId();
            resp.fromWarehouseName = st.getFromWarehouse().getName();
        }
        if (st.getFromZone() != null) {
            resp.fromZoneId = st.getFromZone().getId();
            resp.fromZoneName = st.getFromZone().getName();
        }
        if (st.getFromLocator() != null) {
            resp.fromLocatorId = st.getFromLocator().getId();
            resp.fromLocatorName = st.getFromLocator().getName();
        }
        if (st.getFromBin() != null) {
            resp.fromBinId = st.getFromBin().getId();
            resp.fromBinName = st.getFromBin().getName();
        }

        if (st.getToWarehouse() != null) {
            resp.toWarehouseId = st.getToWarehouse().getId();
            resp.toWarehouseName = st.getToWarehouse().getName();
        }
        if (st.getToZone() != null) {
            resp.toZoneId = st.getToZone().getId();
            resp.toZoneName = st.getToZone().getName();
        }
        if (st.getToLocator() != null) {
            resp.toLocatorId = st.getToLocator().getId();
            resp.toLocatorName = st.getToLocator().getName();
        }
        if (st.getToBin() != null) {
            resp.toBinId = st.getToBin().getId();
            resp.toBinName = st.getToBin().getName();
        }

        resp.items = st.getItems().stream().map(i -> {
            StockTransferResponse.StockTransferItemResponse ir = new StockTransferResponse.StockTransferItemResponse();
            ir.id = i.getId();
            ir.productId = i.getProduct().getId();
            ir.productCode = i.getProduct().getCode();
            ir.productName = i.getProduct().getName();
            ir.batchNumber = i.getBatchNumber();
            ir.quantity = i.getQuantity();
            ir.receivedQty = i.getReceivedQty();
            ir.uom = i.getUom();
            return ir;
        }).toList();

        return resp;
    }
}
