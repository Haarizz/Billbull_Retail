package com.billbull.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
public class CorsConfig {

        @Bean
        public CorsConfigurationSource corsConfigurationSource(
                        @org.springframework.beans.factory.annotation.Value("${billbull.cors.extra-origins:}") String extraOrigins) {

                CorsConfiguration config = new CorsConfiguration();

                java.util.List<String> origins = new java.util.ArrayList<>(List.of(
                "http://localhost:5173",
                "http://77.37.49.42",

                // Client domains (old server)
                "https://nest.billbull.app",
                "https://max.billbull.app",
                "https://hilite.billbull.app",
                "https://albadar.billbull.app",
                "https://agi.billbull.app",
                "https://helenz.billbull.app",

                // Internal environments (old server)
                "https://qa.billbull.app",
                "https://geebu.billbull.app",

                // New client domains (new server 62.72.59.119)
                "https://royaltools.billbull.app",
                "https://leroyalflowers.billbull.app",
                "https://leroyalgifts.billbull.app",
                "https://demo.billbull.app",
                "https://alfahad.billbull.app",
                "https://bikevillage.billbull.app",
                "https://alamwag.billbull.app"
                ));
                // A new client's origin comes from its environment (BILLBULL_CORS_EXTRA_ORIGINS,
                // comma-separated) — onboarding no longer needs a code change and rebuild.
                for (String o : extraOrigins == null ? new String[0] : extraOrigins.split(",")) {
                        String origin = o.trim();
                        if (!origin.isEmpty() && !origin.equals("*") && !origins.contains(origin)) origins.add(origin);
                }
                config.setAllowedOrigins(origins);
                config.setAllowedMethods(List.of(
                                "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
                config.setAllowedHeaders(List.of("*"));
                config.setExposedHeaders(List.of("X-Request-Id"));
                config.setAllowCredentials(true);

                UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();

                source.registerCorsConfiguration("/**", config);
                return source;
        }
}
