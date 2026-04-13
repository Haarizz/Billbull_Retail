package com.billbull.backend.settings.company;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@RestController
@RequestMapping("/api/settings/company-profile")
public class CompanyProfileController {

    private final CompanyProfileService service;

    public CompanyProfileController(CompanyProfileService service) {
        this.service = service;
    }

    /**
     * GET /api/settings/company-profile
     * Returns the client's company profile. Always succeeds — returns
     * an empty default if no row exists yet.
     */
    @GetMapping
    public ResponseEntity<CompanyProfile> getProfile() {
        return ResponseEntity.ok(service.getProfile());
    }

    /**
     * PUT /api/settings/company-profile
     * Full update of company details (name, address, TRN, etc.).
     * Logo is handled separately via the /logo endpoint.
     */
    @PutMapping
    public ResponseEntity<CompanyProfile> updateProfile(@RequestBody CompanyProfile profile) {
        return ResponseEntity.ok(service.updateProfile(profile));
    }

    /**
     * POST /api/settings/company-profile/logo
     * Uploads a new company logo. Stores file under /uploads/company/
     * and persists the relative path in company_profile.logo_path.
     */
    @PostMapping("/logo")
    public ResponseEntity<CompanyProfile> uploadLogo(@RequestParam("file") MultipartFile file) {
        try {
            return ResponseEntity.ok(service.uploadLogo(file));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }
}
