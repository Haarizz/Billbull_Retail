package com.billbull.backend.settings.email;

/**
 * Body of {@code PUT /api/settings/email-config}.
 *
 * <p>{@code password}: blank or absent keeps the stored password, any other value replaces it.
 * The old mask sentinel ({@link EmailConfigService#LEGACY_MASK}) also means "keep", for a browser
 * still running the previous page. Removing the stored password takes {@code clearPassword: true};
 * sending both is refused.
 *
 * <p>{@code smtpSecurity} is STARTTLS or SSL. When absent it is derived from the port (465 means
 * SSL), which is how the previous page, that sent no security mode, keeps working.
 */
public class EmailConfigRequest {

    private String smtpHost;
    private Integer smtpPort;
    private String smtpSecurity;
    private String username;
    private String password;
    private Boolean clearPassword;
    private String fromName;
    private Boolean enabled;

    public String getSmtpHost() { return smtpHost; }
    public void setSmtpHost(String smtpHost) { this.smtpHost = smtpHost; }

    public Integer getSmtpPort() { return smtpPort; }
    public void setSmtpPort(Integer smtpPort) { this.smtpPort = smtpPort; }

    public String getSmtpSecurity() { return smtpSecurity; }
    public void setSmtpSecurity(String smtpSecurity) { this.smtpSecurity = smtpSecurity; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public Boolean getClearPassword() { return clearPassword; }
    public void setClearPassword(Boolean clearPassword) { this.clearPassword = clearPassword; }

    public String getFromName() { return fromName; }
    public void setFromName(String fromName) { this.fromName = fromName; }

    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }

    /** Never prints the password. */
    @Override
    public String toString() {
        return "EmailConfigRequest{host=" + smtpHost + ", port=" + smtpPort + ", security=" + smtpSecurity
                + ", passwordGiven=" + (password != null && !password.isBlank()) + ", clearPassword=" + clearPassword + "}";
    }
}
