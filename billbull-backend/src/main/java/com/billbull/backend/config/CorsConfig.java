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
        public CorsConfigurationSource corsConfigurationSource() {

                CorsConfiguration config = new CorsConfiguration();

                config.setAllowedOrigins(List.of(
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
                "https://leroyalgifts.billbull.app"
                ));
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
