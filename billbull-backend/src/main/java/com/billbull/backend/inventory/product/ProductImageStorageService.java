package com.billbull.backend.inventory.product;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ProductImageStorageService {

    private static final String UPLOAD_DIR = System.getProperty("user.dir") + "/uploads/products";

    public String store(MultipartFile file) {
        if (file == null || file.isEmpty())
            return null;

        try {
            Files.createDirectories(Path.of(UPLOAD_DIR));

            String original = file.getOriginalFilename();
            // Default to .jpg if no extension found, though rare
            String extension = (original != null && original.contains("."))
                    ? original.substring(original.lastIndexOf("."))
                    : ".jpg";

            String filename = UUID.randomUUID() + extension;
            Path path = Path.of(UPLOAD_DIR, filename);

            file.transferTo(path.toFile());

            // Return relative path for frontend to use (with proxy)
            return "/uploads/products/" + filename;
        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException("Failed to store product image: " + e.getMessage());
        }
    }

    /**
     * Save a raw byte array image (e.g. extracted from an Excel embedded picture).
     * @param data      raw image bytes
     * @param extension file extension including dot, e.g. ".png" or ".jpeg"
     * @return relative URL path usable by the frontend, e.g. /uploads/products/uuid.png
     */
    public String storeRawBytes(byte[] data, String extension) {
        if (data == null || data.length == 0) return null;
        try {
            Files.createDirectories(Path.of(UPLOAD_DIR));
            String ext = (extension != null && !extension.isBlank()) ? extension : ".jpg";
            if (!ext.startsWith(".")) ext = "." + ext;
            String filename = UUID.randomUUID() + ext;
            Path path = Path.of(UPLOAD_DIR, filename);
            Files.write(path, data);
            return "/uploads/products/" + filename;
        } catch (IOException e) {
            e.printStackTrace();
            return null; // Don't fail the whole import for a bad image
        }
    }
}

