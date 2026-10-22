package com.billbull.backend.settings.email;

/**
 * What the settings page reads. The stored password never leaves the server, not even masked:
 * {@code passwordSet} says whether there is one.
 */
public record EmailConfigResponse(
        Long id,
        String smtpHost,
        Integer smtpPort,
        String smtpSecurity,
        String username,
        String fromName,
        Boolean enabled,
        boolean passwordSet) {

    static EmailConfigResponse of(EmailConfig c) {
        return new EmailConfigResponse(
                c.getId(),
                c.getSmtpHost(),
                c.getSmtpPort(),
                SmtpSecurity.resolve(c.getSmtpSecurity(), c.getSmtpPort()).name(),
                c.getUsername(),
                c.getFromName(),
                Boolean.TRUE.equals(c.getEnabled()),
                c.getPassword() != null && !c.getPassword().isEmpty());
    }
}
