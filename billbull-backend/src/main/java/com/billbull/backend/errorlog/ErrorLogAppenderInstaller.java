package com.billbull.backend.errorlog;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;

/** Attaches {@link ErrorLogAppender} to the root logger for the life of the application. */
@Component
public class ErrorLogAppenderInstaller {

    static final String APPENDER_NAME = "BILLBULL_ERROR_LOG";

    private final ErrorLogService service;
    private ErrorLogAppender appender;

    public ErrorLogAppenderInstaller(ErrorLogService service) {
        this.service = service;
    }

    @PostConstruct
    void install() {
        if (!service.isEnabled() || !(LoggerFactory.getILoggerFactory() instanceof LoggerContext ctx)) return;
        Logger root = ctx.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        if (root.getAppender(APPENDER_NAME) != null) return;
        appender = new ErrorLogAppender(service);
        appender.setContext(ctx);
        appender.setName(APPENDER_NAME);
        appender.start();
        root.addAppender(appender);
    }

    @PreDestroy
    void uninstall() {
        if (appender == null || !(LoggerFactory.getILoggerFactory() instanceof LoggerContext ctx)) return;
        ctx.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME).detachAppender(appender);
        appender.stop();
    }
}
