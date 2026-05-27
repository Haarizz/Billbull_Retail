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

    @Column(name = "password")
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

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getFromName() { return fromName; }
    public void setFromName(String fromName) { this.fromName = fromName; }

    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }
}
