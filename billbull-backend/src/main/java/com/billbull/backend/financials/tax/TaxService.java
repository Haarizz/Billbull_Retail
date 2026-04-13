package com.billbull.backend.financials.tax;

import java.io.IOException;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Service
public class TaxService {

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

    // --- Configuration Methods ---

    public List<TaxConfiguration> getAllConfigs() {
        return taxConfigurationRepository.findAll();
    }

    public TaxConfiguration saveConfig(TaxConfiguration config) {
        boolean isNew = config.getId() == null;
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
        // Cascade delete is handled by database usually, but here we can manually delete filings if needed
        // Assuming JPA handles foreign key constraints or we delete manually
        List<TaxFiling> filings = taxFilingRepository.findByTaxConfigurationId(id);
        taxFilingRepository.deleteAll(filings);
        taxConfigurationRepository.deleteById(id);
    }

    // --- Filing Methods ---

    public List<TaxFilingDTO> getAllFilings() {
        return taxFilingRepository.findAll().stream()
                .map(TaxFilingDTO::fromEntity)
                .collect(java.util.stream.Collectors.toList());
    }

    public TaxFiling updateFiling(Long id, TaxFiling updatedFiling) {
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
            }

            return taxFilingRepository.save(filing);
        }).orElseThrow(() -> new RuntimeException("Filing not found"));
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
                .orElseThrow(() -> new RuntimeException("Filing not found with id " + filingId));
        
        if (file != null && !file.isEmpty()) {
            storeFile(file, filing);
            
            // Increment document count
            Integer currentCount = filing.getDocuments() != null ? filing.getDocuments() : 0;
            filing.setDocuments(currentCount + 1);
            
            taxFilingRepository.save(filing);
        }
        
        return TaxFilingDTO.fromEntity(filing);
    }
    
    private void storeFile(MultipartFile file, TaxFiling filing) {
        String originalFileName = StringUtils.cleanPath(Objects.requireNonNull(file.getOriginalFilename()));
        String fileName = "tax_filing_" + filing.getId() + "_" + UUID.randomUUID().toString() + "_" + originalFileName;

        try {
            if(fileName.contains("..")) {
                throw new RuntimeException("Sorry! Filename contains invalid path sequence " + fileName);
            }

            Path targetLocation = this.fileStorageLocation.resolve(fileName);
            Files.copy(file.getInputStream(), targetLocation, StandardCopyOption.REPLACE_EXISTING);

            filing.setAttachmentName(originalFileName);
            filing.setAttachmentPath(targetLocation.toString());
        } catch (IOException ex) {
            throw new RuntimeException("Could not store file " + fileName + ". Please try again!", ex);
        }
    }
    public TaxFilingDTO removeDocument(Long filingId) {
        TaxFiling filing = taxFilingRepository.findById(filingId)
                .orElseThrow(() -> new RuntimeException("Filing not found with id " + filingId));

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
                .orElseThrow(() -> new RuntimeException("Filing not found with id " + filingId));

        try {
            if (filing.getAttachmentPath() == null) {
                throw new RuntimeException("No document attached to this filing");
            }
            
            Path filePath = Paths.get(filing.getAttachmentPath());
            Resource resource = new UrlResource(filePath.toUri());

            if (resource.exists() || resource.isReadable()) {
                return resource;
            } else {
                throw new RuntimeException("Could not read the file!");
            }
        } catch (MalformedURLException ex) {
            throw new RuntimeException("Error: " + ex.getMessage());
        }
    }
}
