package com.billbull.backend.errorlog;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.ModelAndView;

/**
 * Sees every exception a controller throws — including the ones {@code GlobalExceptionHandler}
 * turns into a tidy 4xx/5xx — and parks it on the request for {@link ErrorCaptureFilter}, which
 * records it once the final status is known. It resolves nothing (returns null), so responses are
 * exactly what they were before.
 */
@Component
public class ErrorCaptureResolver implements HandlerExceptionResolver, Ordered {

    public static final String EXCEPTION_ATTRIBUTE = ErrorCaptureResolver.class.getName() + ".exception";

    @Override
    public ModelAndView resolveException(HttpServletRequest request, HttpServletResponse response, Object handler,
                                         Exception ex) {
        request.setAttribute(EXCEPTION_ATTRIBUTE, ex);
        return null;
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }
}
