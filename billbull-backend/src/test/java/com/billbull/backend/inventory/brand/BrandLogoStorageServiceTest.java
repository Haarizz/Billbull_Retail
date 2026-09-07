package com.billbull.backend.inventory.brand;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

/**
 * The brand logo field promises "JPG, PNG, SVG under 2MB". The client enforces that too, but a
 * direct API call bypasses the client, so the rules have to hold here.
 */
class BrandLogoStorageServiceTest {

    private final BrandLogoStorageService service = new BrandLogoStorageService();

    @Test
    void rejectsAPdf() {
        MockMultipartFile pdf = new MockMultipartFile(
                "logo", "brochure.pdf", "application/pdf", "%PDF-1.4".getBytes(StandardCharsets.UTF_8));

        IllegalArgumentException ex =
                assertThrows(IllegalArgumentException.class, () -> service.store(pdf));

        assertTrue(ex.getMessage().contains("JPG, PNG and SVG"), ex.getMessage());
    }

    @Test
    void rejectsAnImageContentTypeSmuggledUnderAPdfExtension() {
        MockMultipartFile disguised = new MockMultipartFile(
                "logo", "logo.pdf", "image/png", new byte[] { 1, 2, 3 });

        assertThrows(IllegalArgumentException.class, () -> service.store(disguised));
    }

    @Test
    void rejectsAPdfRenamedToPng() {
        MockMultipartFile renamed = new MockMultipartFile(
                "logo", "logo.png", "application/pdf", "%PDF-1.4".getBytes(StandardCharsets.UTF_8));

        assertThrows(IllegalArgumentException.class, () -> service.store(renamed));
    }

    @Test
    void rejectsAFileWithNoExtensionInsteadOfCrashing() {
        MockMultipartFile noExtension = new MockMultipartFile(
                "logo", "logo", "image/png", new byte[] { 1, 2, 3 });

        assertThrows(IllegalArgumentException.class, () -> service.store(noExtension));
    }

    @Test
    void rejectsAnImageOverTwoMegabytes() {
        MockMultipartFile huge = new MockMultipartFile(
                "logo", "logo.png", "image/png", new byte[2 * 1024 * 1024 + 1]);

        IllegalArgumentException ex =
                assertThrows(IllegalArgumentException.class, () -> service.store(huge));

        assertTrue(ex.getMessage().contains("2MB"), ex.getMessage());
    }

    @Test
    void acceptsASupportedImageAndNormalisesTheExtension() {
        MockMultipartFile jpeg = new MockMultipartFile(
                "logo", "Logo.JPG", "image/jpeg", new byte[] { 1, 2, 3 });

        String storedPath = service.store(jpeg);

        assertTrue(storedPath.startsWith("/uploads/brands/"), storedPath);
        assertEquals(".jpg", storedPath.substring(storedPath.lastIndexOf('.')));
    }
}
