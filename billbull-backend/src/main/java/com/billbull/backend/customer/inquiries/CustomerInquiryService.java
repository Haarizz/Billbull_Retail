package com.billbull.backend.customer.inquiries;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductBarcode;
import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.inventory.product.ProductMedia;
import com.billbull.backend.inventory.product.ProductMediaRepository;
import com.billbull.backend.inventory.product.ProductPricingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;

@Service
public class CustomerInquiryService {

    private final CustomerInquiryRepository inquiryRepo;
    private final InquiryFollowUpRepository followUpRepo;
    private final InquiryItemRepository itemRepo;
    private final ProductRepository productRepo;
    private final StockMovementRepository stockRepo;
    private final ProductPricingRepository pricingRepo;
    private final ProductBarcodeRepository barcodeRepo;
    private final ProductMediaRepository mediaRepo;

    public CustomerInquiryService(CustomerInquiryRepository inquiryRepo,
            InquiryFollowUpRepository followUpRepo,
            InquiryItemRepository itemRepo,
            ProductRepository productRepo,
            StockMovementRepository stockRepo,
            ProductPricingRepository pricingRepo,
            ProductBarcodeRepository barcodeRepo,
            ProductMediaRepository mediaRepo) {
        this.inquiryRepo = inquiryRepo;
        this.followUpRepo = followUpRepo;
        this.itemRepo = itemRepo;
        this.productRepo = productRepo;
        this.stockRepo = stockRepo;
        this.pricingRepo = pricingRepo;
        this.barcodeRepo = barcodeRepo;
        this.mediaRepo = mediaRepo;
    }

    @Transactional(readOnly = true)
    public List<CustomerInquiryResponse> list() {
        return inquiryRepo.findAll().stream()
                .map(this::mapToResponseWithTimeline)
                .collect(Collectors.toList());
    }

    @Transactional
    public CustomerInquiryResponse create(CustomerInquiryRequestDto req) {
        CustomerInquiry inquiry = new CustomerInquiry();
        inquiry.setCustomer(req.getCustomer());
        inquiry.setMobile(req.getMobile());
        inquiry.setEmail(req.getEmail());
        inquiry.setAddress(req.getAddress());
        inquiry.setBranch(req.getBranch());
        inquiry.setSource(req.getSource());
        inquiry.setCategory(req.getCategory());
        inquiry.setPriority(req.getPriority());
        inquiry.setNotes(req.getNotes());
        inquiry.setAssignedTo(req.getAssignedTo());
        inquiry.setStatus("New");
        inquiry.setCreatedDate(LocalDate.now());

        inquiryRepo.save(inquiry);
        
        // Generate and set Inquiry Number
        String formattedId = String.format("INQ-%d-%05d", inquiry.getCreatedDate().getYear(), inquiry.getId());
        inquiry.setInquiryNumber(formattedId);
        inquiryRepo.save(inquiry);

        if (req.getItems() != null && !req.getItems().isEmpty()) {
            List<InquiryItem> items = req.getItems().stream().map(itemReq -> {
                InquiryItem item = new InquiryItem();
                Product p = productRepo.findById(itemReq.getProductId())
                        .orElseThrow(() -> new RuntimeException("Product not found: " + itemReq.getProductId()));
                item.setProduct(p);
                item.setQuantity(itemReq.getQuantity());
                Double price = itemReq.getPrice();
                item.setPrice(price != null ? price : 0.0);
                item.setInquiry(inquiry);
                return itemRepo.save(item);
            }).collect(Collectors.toList());
            inquiry.setItems(items);
        }

        return mapToResponse(inquiry);
    }

    public void delete(Long id) {
        inquiryRepo.deleteById(id);
    }

    @Transactional
    public CustomerInquiryResponse update(Long id, CustomerInquiryRequestDto req) {
        CustomerInquiry inquiry = inquiryRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Inquiry not found"));

        // Update basic fields
        if (req.getCustomer() != null) inquiry.setCustomer(req.getCustomer());
        if (req.getMobile() != null) inquiry.setMobile(req.getMobile());
        if (req.getEmail() != null) inquiry.setEmail(req.getEmail());
        if (req.getAddress() != null) inquiry.setAddress(req.getAddress());
        if (req.getBranch() != null) inquiry.setBranch(req.getBranch());
        if (req.getSource() != null) inquiry.setSource(req.getSource());
        if (req.getCategory() != null) inquiry.setCategory(req.getCategory());
        if (req.getPriority() != null) inquiry.setPriority(req.getPriority());
        if (req.getNotes() != null) inquiry.setNotes(req.getNotes());
        if (req.getAssignedTo() != null) inquiry.setAssignedTo(req.getAssignedTo());
        if (req.getStatus() != null) inquiry.setStatus(req.getStatus());
        if (req.getConvertedQuotationId() != null) inquiry.setConvertedQuotationId(req.getConvertedQuotationId());
        if (req.getConvertedQuotationNo() != null) inquiry.setConvertedQuotationNo(req.getConvertedQuotationNo());
        if (req.getConvertedDate() != null) inquiry.setConvertedDate(req.getConvertedDate());

        inquiryRepo.save(inquiry);
        return mapToResponseWithTimeline(inquiry);
    }

    public void addFollowUp(Long id, FollowUpRequestDto req) {
        CustomerInquiry inquiry = inquiryRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Inquiry not found"));

        InquiryFollowUp followUp = new InquiryFollowUp();
        followUp.setType(req.getType());
        followUp.setSummary(req.getSummary());
        followUp.setNextFollowUpDate(req.getNextFollowUpDate());
        followUp.setNextFollowUpTime(req.getNextFollowUpTime());
        followUp.setStatus(req.getStatus());
        followUp.setInquiry(inquiry);
        followUp.setCreatedBy(inquiry.getAssignedTo()); // Set the assigned rep as the creator

        // Only update inquiry status if provided
        if (req.getStatus() != null && !req.getStatus().isEmpty()) {
            inquiry.setStatus(req.getStatus());
        }
        
        // Update the main inquiry's follow-up date so it appears in filtered lists
        if (req.getNextFollowUpDate() != null) {
            inquiry.setFollowUpDate(req.getNextFollowUpDate());
        }
        if (req.getNextFollowUpTime() != null) {
            inquiry.setFollowUpTime(req.getNextFollowUpTime());
        }
        
        followUpRepo.save(followUp);
        inquiryRepo.save(inquiry);
    }

    public void updateFollowUp(Long followUpId, FollowUpRequestDto req) {
        InquiryFollowUp followUp = followUpRepo.findById(followUpId)
                .orElseThrow(() -> new RuntimeException("Follow-up not found"));

        if (req.getType() != null) followUp.setType(req.getType());
        if (req.getSummary() != null) followUp.setSummary(req.getSummary());
        if (req.getNextFollowUpDate() != null) followUp.setNextFollowUpDate(req.getNextFollowUpDate());
        if (req.getStatus() != null) followUp.setStatus(req.getStatus());

        followUpRepo.save(followUp);
    }

    @Transactional
    public CustomerInquiryResponse reassignRep(Long id, String assignedTo) {
        CustomerInquiry inquiry = inquiryRepo.findById(id)
                .orElseThrow(() -> new RuntimeException("Inquiry not found"));
        
        inquiry.setAssignedTo(assignedTo);
        inquiryRepo.save(inquiry);
        
        // Use getById which properly fetches the timeline
        return getById(id);
    }

    private CustomerInquiryResponse mapToResponse(CustomerInquiry i) {
        return mapToResponseWithTimeline(i);
    }

    private CustomerInquiryResponse mapToResponseWithoutTimeline(CustomerInquiry i) {
        CustomerInquiryResponse res = new CustomerInquiryResponse();
        res.setId(i.getId());
        res.setInquiryNumber(i.getInquiryNumber());
        res.setConvertedQuotationId(i.getConvertedQuotationId());
        res.setConvertedQuotationNo(i.getConvertedQuotationNo());
        res.setConvertedDate(i.getConvertedDate());
        res.setCustomer(i.getCustomer());
        res.setMobile(i.getMobile());
        res.setEmail(i.getEmail());
        res.setAddress(i.getAddress());
        res.setBranch(i.getBranch());
        res.setSource(i.getSource());
        res.setCategory(i.getCategory());
        res.setPriority(i.getPriority());
        res.setStatus(i.getStatus());
        res.setAssignedTo(i.getAssignedTo());
        res.setCreatedDate(i.getCreatedDate());
        res.setTimeline(null);
        res.setItems(
                i.getItems().stream().map(this::mapItemToResponse).collect(Collectors.toList()));
        return res;
    }

    private CustomerInquiryResponse mapToResponseWithTimeline(CustomerInquiry i) {
        CustomerInquiryResponse res = new CustomerInquiryResponse();
        res.setId(i.getId());
        res.setInquiryNumber(i.getInquiryNumber());
        res.setConvertedQuotationId(i.getConvertedQuotationId());
        res.setConvertedQuotationNo(i.getConvertedQuotationNo());
        res.setConvertedDate(i.getConvertedDate());
        res.setCustomer(i.getCustomer());
        res.setMobile(i.getMobile());
        res.setEmail(i.getEmail());
        res.setAddress(i.getAddress());
        res.setBranch(i.getBranch());
        res.setSource(i.getSource());
        res.setCategory(i.getCategory());
        res.setPriority(i.getPriority());
        res.setStatus(i.getStatus());
        res.setAssignedTo(i.getAssignedTo());
        res.setCreatedDate(i.getCreatedDate());
        res.setFollowUpDate(i.getFollowUpDate());
        res.setFollowUpTime(i.getFollowUpTime());

        // Synthesize Activity Log
        List<ActivityLogEntry> activityLog = new ArrayList<>();

        // 1. Creation Event
        if (i.getCreatedAt() != null) {
             String time = i.getCreatedAt().format(DateTimeFormatter.ofPattern("M/d/yyyy, h:mm a"));
             activityLog.add(new ActivityLogEntry("created", "Inquiry created", 
                     i.getCreatedBy() != null ? i.getCreatedBy() : "System", time));
        } else if (i.getCreatedDate() != null) {
             String time = i.getCreatedDate().format(DateTimeFormatter.ofPattern("M/d/yyyy")) + ", 9:00 AM";
             activityLog.add(new ActivityLogEntry("created", "Inquiry created", 
                     i.getAssignedTo() != null ? i.getAssignedTo() : "System", time));
        }

        // 2. Follow-ups
        if (i.getFollowUps() != null) {
            for (InquiryFollowUp f : i.getFollowUps()) {
                String type = "note";
                String fType = f.getType() != null ? f.getType().toLowerCase() : "";
                
                if (fType.contains("whatsapp")) type = "whatsapp";
                else if (fType.contains("email")) type = "email";
                
                String text = f.getSummary() != null ? f.getSummary() : "Follow-up logged";
                String lowerText = text.toLowerCase();
                if (lowerText.contains("status updated")) type = "status";
                else if (lowerText.contains("reassigned")) type = "status"; // Treat reassign as status/system event
                else if (lowerText.contains("quotation") || lowerText.contains("converted")) type = "status";
                
                String user = f.getCreatedBy() != null ? f.getCreatedBy() : (i.getAssignedTo() != null ? i.getAssignedTo() : "System");
                
                String time = "N/A";
                if (f.getCreatedAt() != null) {
                    time = f.getCreatedAt().format(DateTimeFormatter.ofPattern("M/d/yyyy, h:mm a"));
                } else if (f.getNextFollowUpDate() != null) {
                     time = f.getNextFollowUpDate().format(DateTimeFormatter.ofPattern("M/d/yyyy")) + ", 12:00 PM";
                }
                
                activityLog.add(new ActivityLogEntry(type, text, user, time));
            }
        }
        
        // Sort Newest First (Reverse Chronological)
        // Since we added Created (Oldest) first, then FollowUps (Newer -> Newest), regular reverse works.
        // Assuming FollowUps are retrieved in insertion order (default for List/ID).
        Collections.reverse(activityLog);
        
        res.setActivityLog(activityLog);

        // Timeline (Legacy/Existing)
        res.setTimeline(
                i.getFollowUps().stream().map(f -> {
                    InquiryFollowUpResponse fr = new InquiryFollowUpResponse();
                    fr.setDate(f.getNextFollowUpDate());
                    fr.setType(f.getType());
                    fr.setSummary(f.getSummary());
                    fr.setStatus(f.getStatus());
                    fr.setCreatedBy(f.getCreatedBy());
                    return fr;
                }).collect(Collectors.toList()));

        res.setItems(
                i.getItems().stream().map(this::mapItemToResponse).collect(Collectors.toList()));

        return res;
    }

    private InquiryItemResponse mapItemToResponse(InquiryItem item) {
        InquiryItemResponse ir = new InquiryItemResponse();
        Product product = item.getProduct();
        Long productId = product.getId();

        ir.setId(item.getId());
        ir.setProductId(productId);
        ir.setProductCode(product.getCode());
        ir.setItemCode(product.getCode());
        ir.setProductName(product.getName());
        ir.setQuantity(item.getQuantity());
        ir.setPrice(item.getPrice());

        barcodeRepo.findByProductId(productId).stream()
                .map(ProductBarcode::getBarcode)
                .filter(barcode -> barcode != null && !barcode.isBlank())
                .findFirst()
                .ifPresent(ir::setBarcode);

        List<ProductMedia> media = mediaRepo.findByProductId(productId);
        String primaryImage = media.stream()
                .filter(ProductMedia::isPrimary)
                .map(ProductMedia::getImageUrl)
                .findFirst()
                .orElseGet(() -> media.stream()
                        .map(ProductMedia::getImageUrl)
                        .findFirst()
                        .orElse(null));
        ir.setPrimaryImage(primaryImage);
        ir.setImage(primaryImage);

        BigDecimal stock = stockRepo.getTotalAvailableStock(productId);
        double stockVal = stock != null ? stock.doubleValue() : 0;
        ir.setAvailableStock(stockVal);

        if (stockVal <= 0) ir.setStockStatus("out-stock");
        else if (stockVal < 10) ir.setStockStatus("low-stock");
        else ir.setStockStatus("in-stock");

        pricingRepo.findByProductId(productId)
                .ifPresent(p -> ir.setStandardPrice(p.getRetailPrice() != null ? p.getRetailPrice().doubleValue() : 0.0));

        return ir;
    }

    @Transactional(readOnly = true)
    public CustomerInquiryResponse getById(Long id) {
        CustomerInquiry i = inquiryRepo.findByIdWithFollowUps(id)
                .orElseThrow(() -> new RuntimeException("Inquiry not found"));

        return mapToResponseWithTimeline(i);
    }

}
