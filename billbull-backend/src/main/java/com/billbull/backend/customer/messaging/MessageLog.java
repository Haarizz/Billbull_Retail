package com.billbull.backend.customer.messaging;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

@Entity
@Data
@Table(name = "message_logs")
public class MessageLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String recipientName;
    private String recipientContact; // email or phone
    private String channel; // whatsapp, sms, email
    private String status; // delivered, failed, sent

    @Column(columnDefinition = "TEXT")
    private String content;

    private String title; // Subject or Template Title

    // Store tags as comma-separated string: "promotional,urgent"
    @Column(name = "tags")
    private String tagsString;

    private LocalDateTime sentAt;

    @PrePersist
    protected void onCreate() {
        sentAt = LocalDateTime.now();
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
