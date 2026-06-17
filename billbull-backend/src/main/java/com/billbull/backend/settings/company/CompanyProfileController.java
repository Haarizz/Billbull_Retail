package com.billbull.backend.settings.company;

import com.billbull.backend.security.ModulePermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@RestController
@RequestMapping("/api/settings/company-profile")
public class CompanyProfileController {

    private static final String MODULE = "userManagement";

    private final CompanyProfileService service;
    private final ModulePermissionService modulePermissionService;

    public CompanyProfileController(CompanyProfileService service, ModulePermissionService modulePermissionService) {
        this.service = service;
        this.modulePermissionService = modulePermissionService;
    }

    /**
     * GET /api/settings/company-profile
     * Returns the client's company profile. Open to all authenticated users —
     * needed by every module that renders the company logo/name.
     */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
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
        modulePermissionService.requireCanEdit(MODULE);
        return ResponseEntity.ok(service.updateProfile(profile));
    }

    /**
     * POST /api/settings/company-profile/logo
     * Uploads a new company logo. Stores file under /uploads/company/
     * and persists the relative path in company_profile.logo_path.
     */
    @PostMapping("/logo")
    public ResponseEntity<CompanyProfile> uploadLogo(@RequestParam("file") MultipartFile file) {
        modulePermissionService.requireCanEdit(MODULE);
        try {
            return ResponseEntity.ok(service.uploadLogo(file));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * POST /api/settings/company-profile/stamp
     * Uploads a new company stamp. Stores file under /uploads/company/
     * and persists the relative path in company_profile.stamp_path.
     */
    @PostMapping("/stamp")
    public ResponseEntity<CompanyProfile> uploadStamp(@RequestParam("file") MultipartFile file) {
        modulePermissionService.requireCanEdit(MODULE);
        try {
            return ResponseEntity.ok(service.uploadStamp(file));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }
}
