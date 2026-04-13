package com.billbull.backend.sales.customerledger;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

@Entity
@Table(name = "contact_person")
public class ContactPerson {

    public ContactPerson() {} // ✅ REQUIRED

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // =========================
    // RELATIONSHIP (OWNING SIDE)
    // =========================
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id")
    @JsonIgnore
    private Customer customer;

    // =========================
    // FIELDS
    // =========================
    private String name;
    private String designation;
    private String phone;
    private String email;
    private String whatsapp;
    private String gender;

    @Column(length = 1000)
    private String notes;

    private boolean accountContact;

    // =========================
    // GETTERS & SETTERS
    // =========================
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Customer getCustomer() { return customer; }
    public void setCustomer(Customer customer) { this.customer = customer; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDesignation() { return designation; }
    public void setDesignation(String designation) { this.designation = designation; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getWhatsapp() { return whatsapp; }
    public void setWhatsapp(String whatsapp) { this.whatsapp = whatsapp; }

    public String getGender() { return gender; }
    public void setGender(String gender) { this.gender = gender; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public boolean isAccountContact() { return accountContact; }
    public void setAccountContact(boolean accountContact) {
        this.accountContact = accountContact;
    }
}
