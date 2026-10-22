package com.billbull.backend.settings.email;

import jakarta.mail.AuthenticationFailedException;
import jakarta.mail.SendFailedException;
import org.springframework.mail.MailAuthenticationException;

import javax.net.ssl.SSLException;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.security.cert.CertificateException;

/**
 * Turns an SMTP failure into one sentence an administrator can act on. JavaMail messages carry
 * stack-shaped detail ("Could not convert socket to TLS; nested exception is ...") and sometimes
 * the server's raw reply; none of that is shown. The password is never part of either.
 */
final class SmtpErrorMessages {

    private SmtpErrorMessages() {}

    enum Kind { AUTHENTICATION, NO_STARTTLS, TLS, TIMEOUT, CONNECT, RECIPIENT, OTHER }

    record Described(Kind kind, String message) {}

    static Described describe(Throwable failure, String host, Integer port) {
        Described found = find(failure, host + (port != null ? ":" + port : ""), 0);
        return found != null ? found
                : new Described(Kind.OTHER, "The mail server did not accept the message. Check the settings and try again.");
    }

    /**
     * Walks the cause chain and, for Spring's MailSendException, the per-message failures it keeps
     * outside that chain (a timeout while sending DATA arrives only there).
     */
    private static Described find(Throwable failure, String where, int depth) {
        if (failure == null || depth > 8) return null;
        for (Throwable t = failure; t != null; t = t.getCause() == t ? null : t.getCause()) {
            if (t instanceof org.springframework.mail.MailSendException send) {
                for (Exception nested : send.getMessageExceptions()) {
                    Described d = find(nested, where, depth + 1);
                    if (d != null) return d;
                }
            }
            if (t instanceof MailAuthenticationException || t instanceof AuthenticationFailedException) {
                return new Described(Kind.AUTHENTICATION, "The mail server rejected the Email Address or app password. "
                        + "For Gmail, create a new app password, paste it in and save.");
            }
            String text = String.valueOf(t.getMessage());
            if (text.contains("STARTTLS is required")) {
                return new Described(Kind.NO_STARTTLS, where + " did not offer STARTTLS, so nothing was sent and the "
                        + "password was not transmitted. Check the port and security mode (587 STARTTLS, 465 SSL).");
            }
            if (t instanceof SSLException || t instanceof CertificateException
                    || text.contains("Could not convert socket to TLS") || text.contains("server's identity")) {
                return new Described(Kind.TLS, "Could not open a secure connection to " + where + ". The server's "
                        + "certificate was not accepted for this host name, or the security mode does not match the "
                        + "port (587 STARTTLS, 465 SSL).");
            }
            if (t instanceof SocketTimeoutException) {
                return new Described(Kind.TIMEOUT, "The mail server at " + where + " did not answer in time. "
                        + "Try again; if it keeps happening, check the network or the server.");
            }
            if (t instanceof ConnectException || t instanceof UnknownHostException) {
                return new Described(Kind.CONNECT, "Could not connect to " + where + ". Check the host and port, and "
                        + "that this server may open outbound connections on that port.");
            }
            if (t instanceof SendFailedException) {
                return new Described(Kind.RECIPIENT, "The mail server refused the recipient address.");
            }
        }
        return null;
    }
}
