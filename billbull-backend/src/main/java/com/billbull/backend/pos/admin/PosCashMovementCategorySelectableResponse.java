package com.billbull.backend.pos.admin;

/** Minimal, low-privilege lookup row for populating the category dropdown in the POS Cash
 *  Drop/Out dialogs — deliberately excludes GL mapping, audit fields, and description, since
 *  any authenticated POS user (not just pos.admin.cashmovement.category.view holders) can
 *  fetch this to complete a cash movement. */
public class PosCashMovementCategorySelectableResponse {
    private Long id;
    private String name;
    private boolean notesRequired;

    public static PosCashMovementCategorySelectableResponse from(PosCashMovementCategory c) {
        PosCashMovementCategorySelectableResponse r = new PosCashMovementCategorySelectableResponse();
        r.id = c.getId();
        r.name = c.getName();
        r.notesRequired = c.isNotesRequired();
        return r;
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public boolean isNotesRequired() { return notesRequired; }
}
