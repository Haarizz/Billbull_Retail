FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B clean package -DskipTests

# A Spring Boot fat jar nests its dependencies under BOOT-INF/lib/*.jar, so
# `java -cp app.jar com.microsoft.playwright.CLI` can't see the Playwright classes —
# they're not on the top-level classpath. Resolve Playwright's own CLI jar (which has
# its own Main-Class manifest) as a standalone dependency instead.
RUN mvn -B org.apache.maven.plugins:maven-dependency-plugin:3.6.1:copy \
    -Dartifact=com.microsoft.playwright:playwright:1.49.0 \
    -DoutputDirectory=/app/playwright-cli

FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

# Playwright/Chromium runtime deps (headless PDF generation via document.HtmlPdfService)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk-bridge2.0-0 libx11-xcb1 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 libgtk-3-0 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/target/billbull-backend-*.jar app.jar
COPY --from=build /app/playwright-cli/playwright-1.49.0.jar playwright-cli.jar

ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN java -jar playwright-cli.jar install --with-deps chromium && rm playwright-cli.jar

EXPOSE 8082
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
