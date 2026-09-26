package com.billbull.backend.sales.settings;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

@Service
public class SalesSettingsService {

    private final SalesSettingsRepository repo;
    private final SalesDocumentNumberingService numberingService;
    private final ObjectMapper objectMapper;

    public SalesSettingsService(
            SalesSettingsRepository repo,
            SalesDocumentNumberingService numberingService,
            ObjectMapper objectMapper) {
        this.repo = repo;
        this.numberingService = numberingService;
        this.objectMapper = objectMapper;
    }

    /**
     * Returns the singleton settings row. If it doesn't exist yet,
     * creates a default one (stockCheckRequired = false, policy = NO_IMPACT).
     */
    @Transactional
    public SalesSettings getSettings() {
        SalesSettings settings = loadOrDefault();
        settings.setDocumentNumbering(numberingService.getAllSettingsWithPreview());
        return settings;
    }

    /**
     * Merges the supplied fields onto the stored singleton and saves it.
     *
     * <p>MERGE, not replace. The previous implementation did {@code repo.save(incoming)} on a
     * freshly-deserialised entity, so any field absent from the request body silently reverted to
     * its Java default — for a primitive {@code boolean} that means {@code false}. That was
     * survivable while every field was a cosmetic preference; it is not survivable now that
     * {@code salespersonRequiredAtPos} / {@code monthlyTargetRequired} decide whether sales are
     * allowed at all, because any partial PUT from any client would quietly switch enforcement off.
     *
     * <p>The merge is done with Jackson's {@code readerForUpdating}, which applies ONLY the
     * properties actually present in the JSON. That is what makes "absent" distinguishable from
     * "explicitly false" without boxing every field or hand-writing a copier that the next new
     * setting would forget to update.
     */
    @Transactional
    public SalesSettings saveSettings(JsonNode incoming) {
        if (incoming == null || !incoming.isObject()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sales settings payload is required.");
        }

        // documentNumbering lives in its own table and is @Transient on the entity — it is saved by
        // its own service and must not reach readerForUpdating, which would otherwise try to
        // deserialise it back onto the transient field.
        ObjectNode body = ((ObjectNode) incoming).deepCopy();
        JsonNode numbering = body.remove("documentNumbering");
        // The id is fixed at 1 (singleton); never let a request move it.
        body.remove("id");

        List<SalesDocumentNumberSetting> documentNumbering =
                numberingService.saveSettings(readDocumentNumbering(numbering));

        SalesSettings existing = loadOrDefault();
        try {
            objectMapper.readerForUpdating(existing).readValue(body);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Invalid sales settings payload: " + ex.getMessage());
        }
        existing.setId(1L); // Always singleton

        SalesSettings saved = repo.save(existing);
        saved.setDocumentNumbering(documentNumbering);
        return saved;
    }

    /**
     * Typed convenience for internal/test callers. A fully-populated entity carries every field, so
     * merging it is equivalent to replacing — the distinction only matters for partial JSON, which
     * is what {@link #saveSettings(JsonNode)} exists to handle.
     */
    @Transactional
    public SalesSettings saveSettings(SalesSettings incoming) {
        ObjectNode body = objectMapper.valueToTree(incoming);
        if (incoming != null && incoming.getDocumentNumbering() != null) {
            body.set("documentNumbering", objectMapper.valueToTree(incoming.getDocumentNumbering()));
        }
        return saveSettings((JsonNode) body);
    }

    private List<SalesDocumentNumberSetting> readDocumentNumbering(JsonNode numbering) {
        if (numbering == null || numbering.isNull() || !numbering.isArray()) {
            // Absent/null means "leave document numbering alone"; the numbering service already
            // treats an empty list as a no-op and returns the stored rows.
            return List.of();
        }
        try {
            return objectMapper.readValue(
                    objectMapper.treeAsTokens(numbering),
                    objectMapper.getTypeFactory()
                            .constructCollectionType(List.class, SalesDocumentNumberSetting.class));
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Invalid document numbering payload: " + ex.getMessage());
        }
    }

    /** The stored singleton, or an unsaved defaults instance when the row does not exist yet. */
    private SalesSettings loadOrDefault() {
        return repo.findById(1L).orElseGet(() -> {
            SalesSettings defaults = new SalesSettings();
            defaults.setId(1L);
            defaults.setStockCheckRequired(false);
            defaults.setCreditLimitPolicy(CreditLimitPolicy.NO_IMPACT);
            return defaults;
        });
    }
}
