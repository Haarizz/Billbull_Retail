package com.billbull.backend.settings.company;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

@Service
public class CompanyProfileService {

    private static final String LOGO_UPLOAD_DIR = System.getProperty("user.dir") + "/uploads/company";

    private final CompanyProfileRepository repo;

    public CompanyProfileService(CompanyProfileRepository repo) {
        this.repo = repo;
    }

    /**
     * Returns the singleton company profile (id = 1).
     * If none exists yet, returns an empty default so the frontend never gets a 404.
     */
    @Transactional(readOnly = true)
    public CompanyProfile getProfile() {
        return repo.findById(1L).orElseGet(() -> {
            CompanyProfile empty = new CompanyProfile();
            empty.setId(1L);
            empty.setCurrency("AED");
            empty.setCurrencySymbol("AED");
            return empty;
        });
    }

    /**
     * Upserts the singleton profile row.
     * Always forces id = 1 to guarantee singleton behaviour.
     */
    @Transactional
    public CompanyProfile updateProfile(CompanyProfile incoming) {
        // Preserve existing logoPath if not provided in the update payload
        if (incoming.getLogoPath() == null || incoming.getLogoPath().isBlank()) {
            repo.findById(1L).ifPresent(existing ->
                incoming.setLogoPath(existing.getLogoPath())
            );
        }
        incoming.setId(1L);
        return repo.save(incoming);
    }

    /**
     * Saves the uploaded logo file under uploads/company/ and persists the
     * relative path into the company_profile row.
     *
     * @return the updated CompanyProfile with the new logoPath
     */
    @Transactional
    public CompanyProfile uploadLogo(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Logo file must not be empty");
        }

        // Derive extension
        String original = file.getOriginalFilename();
        String extension = (original != null && original.contains("."))
                ? original.substring(original.lastIndexOf("."))
                : ".png";

        String filename = UUID.randomUUID() + extension;
        Path dir = Path.of(LOGO_UPLOAD_DIR);
        Files.createDirectories(dir);
        file.transferTo(dir.resolve(filename).toFile());

        String logoPath = "/uploads/company/" + filename;

        // Upsert the singleton row with the new logo path
        CompanyProfile profile = repo.findById(1L).orElseGet(() -> {
            CompanyProfile p = new CompanyProfile();
            p.setId(1L);
            return p;
        });
        profile.setLogoPath(logoPath);
        return repo.save(profile);
    }
}
