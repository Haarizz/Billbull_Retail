package com.billbull.backend.financials.tax;

import com.fasterxml.jackson.annotation.JsonBackReference;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "tax_filings")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TaxFiling {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "config_id", nullable = false)
    @JsonBackReference
    private TaxConfiguration taxConfiguration;

    private String period;
    private String dueDate;
    private String filedDate;
    @Column(precision = 15, scale = 2)
    private BigDecimal amount;
    private String status;
    private Integer documents;

    @Column(columnDefinition = "TEXT")
    private String notes;
    
    private String attachmentPath;
    private String attachmentName;
}
