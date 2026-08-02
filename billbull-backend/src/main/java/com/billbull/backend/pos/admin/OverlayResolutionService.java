package com.billbull.backend.pos.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class OverlayResolutionService {

    private final CorrectionOverlayRepository overlayRepository;
    private final ObjectMapper objectMapper;

    public OverlayResolutionService(CorrectionOverlayRepository overlayRepository, ObjectMapper objectMapper) {
        this.overlayRepository = overlayRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * Resolves the corrected values for a given DTO.
     * Finds the latest APPLIED correction overlay for the target.
     * If an overlay exists, merges the corrected snapshot over the original DTO.
     * Preserves unchanged fields.
     */
    public <T> T resolveOverlay(CorrectionTargetType targetType, Long targetId, T originalDto) {
        if (originalDto == null || targetType == null || targetId == null) {
            return originalDto;
        }

        List<CorrectionOverlay> overlays = overlayRepository.findAppliedForTargetOrderByVersionDesc(targetType, targetId);
        if (overlays.isEmpty()) {
            return originalDto;
        }

        CorrectionOverlay latestOverlay = overlays.get(0);
        String correctedJson = latestOverlay.getCorrectedSnapshotJson();
        if (correctedJson == null || correctedJson.isBlank()) {
            return originalDto;
        }

        try {
            return objectMapper.readerForUpdating(originalDto).readValue(correctedJson);
        } catch (Exception e) {
            // In case of JSON mapping error, return the original DTO
            return originalDto;
        }
    }

    /**
     * Bulk resolves overlays for a collection of DTOs to avoid N+1 queries.
     * Extracts IDs, performs a single batch lookup, and merges the latest APPLIED 
     * correction overlays into the respective original DTOs.
     */
    public <T> List<T> resolveOverlays(CorrectionTargetType targetType, List<T> originalDtos, java.util.function.Function<T, Long> idExtractor) {
        if (originalDtos == null || originalDtos.isEmpty() || targetType == null || idExtractor == null) {
            return originalDtos;
        }

        List<Long> targetIds = originalDtos.stream()
                .map(idExtractor)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();

        if (targetIds.isEmpty()) {
            return originalDtos;
        }

        List<CorrectionOverlay> allOverlays = overlayRepository.findAppliedForTargetsOrderByVersionDesc(targetType, targetIds);
        
        // Group by targetId and keep only the first one (which is the latest version due to ORDER BY targetId ASC, version DESC)
        java.util.Map<Long, CorrectionOverlay> latestOverlayMap = allOverlays.stream()
                .collect(java.util.stream.Collectors.toMap(
                        CorrectionOverlay::getTargetId,
                        o -> o,
                        (existing, replacement) -> existing
                ));

        return originalDtos.stream().map(dto -> {
            Long id = idExtractor.apply(dto);
            CorrectionOverlay overlay = id != null ? latestOverlayMap.get(id) : null;
            if (overlay == null) {
                return dto;
            }
            String correctedJson = overlay.getCorrectedSnapshotJson();
            if (correctedJson == null || correctedJson.isBlank()) {
                return dto;
            }
            try {
                return objectMapper.readerForUpdating(dto).readValue(correctedJson);
            } catch (Exception e) {
                return dto;
            }
        }).toList();
    }
}
