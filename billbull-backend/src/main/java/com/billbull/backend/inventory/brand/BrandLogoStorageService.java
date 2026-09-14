package com.billbull.backend.inventory.brand;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class BrandLogoStorageService {

    private static final String UPLOAD_DIR =
            System.getProperty("user.dir") + "/uploads/brands";

    // The client validates too, but that is only a convenience — anything reaching this service
    // (a direct API call, a renamed file) still has to be rejected here.
    private static final List<String> ALLOWED_EXTENSIONS = List.of(".jpg", ".jpeg", ".png", ".svg");
    private static final List<String> ALLOWED_CONTENT_TYPES =
            List.of("image/jpeg", "image/jpg", "image/png", "image/svg+xml");
    private static final long MAX_BYTES = 2L * 1024 * 1024;

    public String store(MultipartFile file) {
        String extension = validate(file);

        try {
            Files.createDirectories(Path.of(UPLOAD_DIR));

            String filename = UUID.randomUUID() + extension;
            Path path = Path.of(UPLOAD_DIR, filename);

            file.transferTo(path.toFile());

            return "/uploads/brands/" + filename;
        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException("Failed to store brand logo: " + e.getMessage());
        }
    }

    /** Returns the normalised (lower-case, leading-dot) extension to store the file under. */
    private String validate(MultipartFile file) {
        String original = file.getOriginalFilename();
        int dot = original == null ? -1 : original.lastIndexOf('.');
        // No extension at all used to blow up with a StringIndexOutOfBoundsException.
        String extension = dot < 0 ? "" : original.substring(dot).toLowerCase(Locale.ROOT);

        if (!ALLOWED_EXTENSIONS.contains(extension)) {
            throw new IllegalArgumentException(
                    "Unsupported logo format. Only JPG, PNG and SVG images are allowed.");
        }

        String contentType = file.getContentType();
        if (contentType != null
                && !ALLOWED_CONTENT_TYPES.contains(contentType.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException(
                    "Unsupported logo format. Only JPG, PNG and SVG images are allowed.");
        }

        if (file.getSize() > MAX_BYTES) {
            throw new IllegalArgumentException("Logo is too large. The maximum size is 2MB.");
        }

        return extension;
    }
}
