package com.billbull.backend.financials.tax;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Entity
@Table(name = "tax_configurations")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TaxConfiguration {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String type;
    private String frequency;
    private String rate;
    
    @ElementCollection(fetch = FetchType.EAGER)
    private List<String> accounts;
    
    private String status;
}
