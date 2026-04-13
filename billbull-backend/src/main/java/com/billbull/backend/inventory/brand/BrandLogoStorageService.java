package com.billbull.backend.inventory.brand;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

@Service
public class BrandLogoStorageService {

    private static final String UPLOAD_DIR =
            System.getProperty("user.dir") + "/uploads/brands";

    public String store(MultipartFile file) {
        try {
            Files.createDirectories(Path.of(UPLOAD_DIR));

            String original = file.getOriginalFilename();
            String extension = original.substring(original.lastIndexOf("."));

            String filename = UUID.randomUUID() + extension;
            Path path = Path.of(UPLOAD_DIR, filename);

            file.transferTo(path.toFile());

            return "/uploads/brands/" + filename;
        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException("Failed to store brand logo: " + e.getMessage());
        }
    }
}
