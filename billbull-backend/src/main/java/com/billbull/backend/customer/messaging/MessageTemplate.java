package com.billbull.backend.customer.messaging;

import jakarta.persistence.*;
import lombok.Data;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Entity
@Data
@Table(name = "message_templates")
public class MessageTemplate {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String title;
    
    @Column(columnDefinition = "TEXT")
    private String body;

    // Store tags as comma-separated string: "whatsapp,sms,email"
    @Column(name = "tags")
    private String tagsString;

    private int uses;
    
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    // Helper method to get tags as List for frontend
    @Transient
    public List<String> getTags() {
        if (tagsString == null || tagsString.isEmpty()) {
            return List.of();
        }
        return Arrays.asList(tagsString.split(","));
    }

    // Helper method to set tags from List (frontend sends array)
    @Transient
    public void setTags(List<String> tags) {
        if (tags == null || tags.isEmpty()) {
            this.tagsString = "";
        } else {
            this.tagsString = String.join(",", tags);
        }
    }
}
