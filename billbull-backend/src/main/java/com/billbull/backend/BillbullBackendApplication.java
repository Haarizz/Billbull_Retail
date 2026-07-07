package com.billbull.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.util.TimeZone;

@SpringBootApplication
@EnableJpaAuditing
@EnableCaching
@EnableScheduling
@EnableAsync
public class BillbullBackendApplication {

	public static void main(String[] args) {
		// All entity timestamps (createdAt/updatedAt via @CreationTimestamp,
		// JPA auditing) are captured with LocalDateTime.now(), which follows
		// the JVM default timezone. Pin it to the business's operating
		// timezone (UAE) so invoice/receipt times are correct regardless of
		// what timezone the host server itself happens to be running in.
		TimeZone.setDefault(TimeZone.getTimeZone("Asia/Dubai"));
		SpringApplication.run(BillbullBackendApplication.class, args);
	}

}