package com.billbull.backend.purchase.rfq;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** An LPO that was created from an RFQ. */
@Embeddable
@Getter
@Setter
@NoArgsConstructor
public class RfqLpoRef {

    @Column(name = "lpo_id")
    private Long lpoId;

    @Column(name = "lpo_number", nullable = false, length = 80)
    private String lpoNumber;

    @Column(name = "vendor_id")
    private Long vendorId;

    @Column(name = "vendor_name")
    private String vendorName;

    @Column(name = "created_on")
    private LocalDateTime createdOn;

    public RfqLpoRef(Long lpoId, String lpoNumber, Long vendorId, String vendorName, LocalDateTime createdOn) {
        this.lpoId = lpoId;
        this.lpoNumber = lpoNumber;
        this.vendorId = vendorId;
        this.vendorName = vendorName;
        this.createdOn = createdOn;
    }
}
