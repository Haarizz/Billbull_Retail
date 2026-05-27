package com.billbull.backend.financials.tax;

import java.io.IOException;
import java.net.MalformedURLException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TaxService {

    private static final Set<String> ALLOWED_FREQUENCIES = Set.of("Monthly", "Quarterly", "Annually");
    private static final Set<String> ALLOWED_CONFIG_STATUSES = Set.of("Active", "Inactive");
    private static final Set<String> ALLOWED_FILING_STATUSES = Set.of("Pending", "Filed", "Overdue");
    private static final Set<String> ALLOWED_DOCUMENT_EXTENSIONS = Set.of(
            "pdf", "png", "jpg", "jpeg", "doc", "docx", "xls", "xlsx", "xml");
    private static final long MAX_DOCUMENT_SIZE_BYTES = 10L * 1024L * 1024L;

    private final TaxConfigurationRepository taxConfigurationRepository;
    private final TaxFilingRepository taxFilingRepository;
    private final Path fileStorageLocation;

    public TaxService(
            TaxConfigurationRepository taxConfigurationRepository,
            TaxFilingRepository taxFilingRepository,
            @Value("${file.upload-dir:uploads}/tax_filings") String uploadDir) {
        this.taxConfigurationRepository = taxConfigurationRepository;
        this.taxFilingRepository = taxFilingRepository;
        this.fileStorageLocation = Paths.get(uploadDir).toAbsolutePath().normalize();

        try {
            Files.createDirectories(this.fileStorageLocation);
        } catch (Exception ex) {
            throw new RuntimeException("Could not create the directory where tax documents will be stored.", ex);
        }
    }

    /**
     * Returns the rate of the first Active VAT-type configuration so that
     * sales screens can fall back to the registered VAT rate when a product
     * has no per-item Sales Tax % set. Empty when no Active VAT row exists.
     *
     * Matches "VAT" case-insensitively to also accept variants like
     * "Output VAT" / "Sales VAT" that some tenants register.
     */
    public Optional<BigDecimal> getActiveVatRate() {
        return taxConfigurationRepository.findAll().stream()
                .filter(cfg -> cfg.getType() != null
                        && cfg.getType().toUpperCase().contains("VAT"))
                .filter(cfg -> "Active".equalsIgnoreCase(cfg.getStatus()))
                .map(TaxConfiguration::getRate)
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(r -> !r.isEmpty())
                .map(r -> r.endsWith("%") ? r.substring(0, r.length() - 1).trim() : r)
                .map(r -> {
                    try { return new BigDecimal(r); }
                    catch (NumberFormatException e) { return null; }
                })
                .filter(Objects::nonNull)
                .filter(r -> r.signum() >= 0)
                .findFirst();
    }

    // --- Configuration Methods ---

    public List<TaxConfiguration> getAllConfigs() {
        return taxConfigurationRepository.findAll();
    }

    public TaxConfiguration saveConfig(TaxConfiguration config) {
        validateConfig(config);
        boolean isNew = config.getId() == null;
        if (!isNew && !taxConfigurationRepository.existsById(config.getId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Tax configuration not found");
        }
        TaxConfiguration savedConfig = taxConfigurationRepository.save(config);

        if (isNew) {
            // Auto-create initial filing for demo purposes
            createInitialFiling(savedConfig);
        }
        return savedConfig;
    }

    public Optional<TaxConfiguration> getConfigById(Long id) {
        return taxConfigurationRepository.findById(id);
    }

    @Transactional
    public void deleteConfig(Long id) {
        if (!taxConfigurationRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Tax configuration not found");
        }
        // Cascade delete is handled by database usually, but here we can manually delete filings if needed
        // Assuming JPA handles foreign key constraints or we delete manually
        List<TaxFiling> filings = taxFilingRepository.findByTaxConfigurationId(id);
        taxFilingRepository.deleteAll(filings);
        taxConfigurationRepository.deleteById(id);
    }

    private void validateConfig(TaxConfiguration config) {
        if (config == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tax configuration is required");
        }
        if (!StringUtils.hasText(config.getType())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tax type is required");
        }
        if (!StringUtils.hasText(config.getFrequency()) || !ALLOWED_FREQUENCIES.contains(config.getFrequency())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Valid filing frequency is required");
        }

        BigDecimal rate = parseRate(config.getRate());
        if (rate.compareTo(BigDecimal.ZERO) < 0 || rate.compareTo(BigDecimal.valueOf(100)) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tax rate must be between 0 and 100");
        }
        config.setRate(rate.stripTrailingZeros().toPlainString() + "%");

        if (!StringUtils.hasText(config.getStatus())) {
            config.setStatus("Active");
        } else if (!ALLOWED_CONFIG_STATUSES.contains(config.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Valid tax configuration status is required");
        }

        if (config.getAccounts() != null) {
            config.setAccounts(config.getAccounts().stream()
                    .filter(StringUtils::hasText)
                    .map(String::trim)
                    .distinct()
                    .collect(Collectors.toList()));
        }
    }

    private BigDecimal parseRate(String rateText) {
        if (!StringUtils.hasText(rateText)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tax rate is required");
        }
        try {
            return new BigDecimal(rateText.replace("%", "").trim());
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tax rate must be numeric");
        }
    }

    private void validateFilingUpdate(TaxFiling updatedFiling) {
        if (updatedFiling == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tax filing update is required");
        }
        if (updatedFiling.getAmount() != null && updatedFiling.getAmount() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tax filing amount cannot be negative");
        }
        if (updatedFiling.getStatus() != null && !ALLOWED_FILING_STATUSES.contains(updatedFiling.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Valid filing status is required");
        }
    }

    // --- Filing Methods ---

    @Transactional
    public List<TaxFilingDTO> getAllFilings() {
        // QA-057: ensure every active configuration has at least one filing so the
        // dashboard never renders "TBD" / a missing File Return button. createConfig
        // seeds an initial filing for new configs, but pre-existing configs (created
        // before that hook was added) and configs whose lone filing was deleted both
        // miss out otherwise.
        for (TaxConfiguration config : taxConfigurationRepository.findAll()) {
            if (!"Active".equals(config.getStatus())) {
                continue;
            }
            if (taxFilingRepository.findByTaxConfigurationId(config.getId()).isEmpty()) {
                createInitialFiling(config);
            }
        }

        return taxFilingRepository.findAll().stream()
                .map(TaxFilingDTO::fromEntity)
                .collect(java.util.stream.Collectors.toList());
    }

    public TaxFiling updateFiling(Long id, TaxFiling updatedFiling) {
        validateFilingUpdate(updatedFiling);
        return taxFilingRepository.findById(id).map(filing -> {
            if (updatedFiling.getAmount() != null) {
                filing.setAmount(updatedFiling.getAmount());
            }
            if (updatedFiling.getStatus() != null) {
                filing.setStatus(updatedFiling.getStatus());
            }
            // Only update dueDate if a non-blank value is provided
            if (updatedFiling.getDueDate() != null && !updatedFiling.getDueDate().isBlank()) {
                filing.setDueDate(updatedFiling.getDueDate());
            }
            if (updatedFiling.getNotes() != null) {
                filing.setNotes(updatedFiling.getNotes());
            }

            if ("Filed".equals(updatedFiling.getStatus()) && filing.getFiledDate() == null) {
                filing.setFiledDate(LocalDate.now().format(DateTimeFormatter.ofPattern("dd MMM yyyy")));
            } else if (updatedFiling.getStatus() != null && !"Filed".equals(updatedFiling.getStatus())) {
                filing.setFiledDate(null);
            }

            return taxFilingRepository.save(filing);
        }).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tax filing not found"));
    }

    private void createInitialFiling(TaxConfiguration config) {
        TaxFiling filing = new TaxFiling();
        filing.setTaxConfiguration(config);

        LocalDate now = LocalDate.now();
        DateTimeFormatter display = DateTimeFormatter.ofPattern("dd MMM yyyy");

        String frequency = config.getFrequency() != null ? config.getFrequency() : "Quarterly";
        String period;
        String dueDate;

        switch (frequency) {
            case "Monthly":
                period = now.format(DateTimeFormatter.ofPattern("MMMM yyyy"));
                dueDate = now.withDayOfMonth(1).plusMonths(1).plusDays(27).format(display);
                break;
            case "Annually":
                period = "FY " + now.getYear();
                dueDate = LocalDate.of(now.getYear() + 1, 3, 31).format(display);
                break;
            default: // Quarterly
                int quarter = (now.getMonthValue() - 1) / 3 + 1;
                period = "Q" + quarter + " " + now.getYear();
                int quarterEndMonth = quarter * 3;
                LocalDate quarterEnd = LocalDate.of(now.getYear(), quarterEndMonth, 1)
                        .withDayOfMonth(1).plusMonths(1).minusDays(1);
                dueDate = quarterEnd.plusDays(28).format(display);
                break;
        }

        filing.setPeriod(period);
        filing.setDueDate(dueDate);
        filing.setAmount(0.0);
        filing.setStatus("Pending");
        filing.setDocuments(0);
        taxFilingRepository.save(filing);
    }
    
    // --- File Upload Methods ---
    
    public TaxFilingDTO uploadDocument(Long filingId, MultipartFile file) {
        TaxFiling filing = taxFilingRepository.findById(filingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Tax filing not found with id " + filingId));
        
        validateDocument(file);
        deleteExistingAttachment(filing);
        storeFile(file, filing);
        filing.setDocuments(1);
        taxFilingRepository.save(filing);
        
        return TaxFilingDTO.fromEntity(filing);
    }

    private void validateDocument(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Document file is required");
        }
        if (file.getSize() > MAX_DOCUMENT_SIZE_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Document size must be 10 MB or less");
        }

        String originalFileName = file.getOriginalFilename();
        if (!StringUtils.hasText(originalFileName)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Document filename is required");
        }

        String extension = "";
        int dotIndex = originalFileName.lastIndexOf('.');
        if (dotIndex >= 0 && dotIndex < originalFileName.length() - 1) {
            extension = originalFileName.substring(dotIndex + 1).toLowerCase();
        }
        if (!ALLOWED_DOCUMENT_EXTENSIONS.contains(extension)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unsupported document type. Upload PDF, image, Word, Excel, or XML files");
        }
    }
    
    private void storeFile(MultipartFile file, TaxFiling filing) {
        String originalFileName = StringUtils.cleanPath(Objects.requireNonNull(file.getOriginalFilename()));
        String fileName = "tax_filing_" + filing.getId() + "_" + UUID.randomUUID().toString() + "_" + originalFileName;

        try {
            if(fileName.contains("..")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Filename contains invalid path sequence " + fileName);
            }

            Path targetLocation = this.fileStorageLocation.resolve(fileName);
            Files.copy(file.getInputStream(), targetLocation, StandardCopyOption.REPLACE_EXISTING);

            filing.setAttachmentName(originalFileName);
            filing.setAttachmentPath(targetLocation.toString());
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Could not store file " + originalFileName + ". Please try again!", ex);
        }
    }

    private void deleteExistingAttachment(TaxFiling filing) {
        if (filing.getAttachmentPath() == null) {
            return;
        }

        try {
            Files.deleteIfExists(Paths.get(filing.getAttachmentPath()));
        } catch (IOException e) {
            System.err.println("Failed to delete existing tax document: " + e.getMessage());
        }
    }

    public TaxFilingDTO removeDocument(Long filingId) {
        TaxFiling filing = taxFilingRepository.findById(filingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Tax filing not found with id " + filingId));

        if (filing.getAttachmentPath() != null) {
            try {
                Path filePath = Paths.get(filing.getAttachmentPath());
                Files.deleteIfExists(filePath);
            } catch (IOException e) {
                // Log and continue
                System.err.println("Failed to delete file: " + e.getMessage());
            }

            filing.setAttachmentPath(null);
            filing.setAttachmentName(null);
            
            int current = filing.getDocuments() != null ? filing.getDocuments() : 0;
            filing.setDocuments(Math.max(0, current - 1));
            
            taxFilingRepository.save(filing);
        }
        
        return TaxFilingDTO.fromEntity(filing);
    }

    public Resource loadDocument(Long filingId) {
        TaxFiling filing = taxFilingRepository.findById(filingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Tax filing not found with id " + filingId));

        try {
            if (filing.getAttachmentPath() == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No document attached to this filing");
            }
            
            Path filePath = Paths.get(filing.getAttachmentPath());
            Resource resource = new UrlResource(filePath.toUri());

            if (resource.exists() && resource.isReadable()) {
                return resource;
            } else {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Could not read the file");
            }
        } catch (MalformedURLException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Error reading document");
        }
    }
}
