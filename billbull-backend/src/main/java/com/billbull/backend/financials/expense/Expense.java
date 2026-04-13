package com.billbull.backend.financials.expense;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "expenses")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Expense {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private LocalDate date;
    private String vendor;
    private String category;
    private String costCenter;
    private String location;
    private Double amount;
    private Double taxRate;
    private Double taxAmount;
    private Double total;
    private String status;

    @Column(columnDefinition = "TEXT")
    private String notes;
}
