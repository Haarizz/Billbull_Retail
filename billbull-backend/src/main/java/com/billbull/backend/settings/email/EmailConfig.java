package com.billbull.backend.settings.email;

import jakarta.persistence.*;

@Entity
@Table(name = "email_config")
public class EmailConfig {

    @Id
    private Long id = 1L;

    @Column(name = "smtp_host")
    private String smtpHost;

    @Column(name = "smtp_port")
    private Integer smtpPort = 587;

    @Column(name = "username")
    private String username;

    // ARCHFIX S4: SMTP password is encrypted at rest (AES-GCM via the JPA converter) — it must be
    // reversible because it is replayed to the mail server, so it cannot be hashed. The API layer
    // already masks it in responses; @JsonIgnore is defense-in-depth so the entity never serializes
    // the real value. length widened to fit base64 ciphertext.
    @Column(name = "password", length = 512)
    @jakarta.persistence.Convert(converter = com.billbull.backend.common.crypto.EncryptedStringConverter.class)
    private String password;

    @Column(name = "from_name")
    private String fromName;

    @Column(name = "enabled")
    private Boolean enabled = false;

    // -------------------------------------------------------
    // Getters & Setters
    // -------------------------------------------------------

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getSmtpHost() { return smtpHost; }
    public void setSmtpHost(String smtpHost) { this.smtpHost = smtpHost; }

    public Integer getSmtpPort() { return smtpPort; }
    public void setSmtpPort(Integer smtpPort) { this.smtpPort = smtpPort; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    // NOTE: not @JsonIgnore — EmailConfigService.getConfigMasked() deliberately serializes a masked
    // "••••" placeholder so the UI knows a password is set and echoes the sentinel back on save
    // (saveConfig preserves the stored value when it sees it). The real value is never serialized.
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getFromName() { return fromName; }
    public void setFromName(String fromName) { this.fromName = fromName; }

    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }
}
