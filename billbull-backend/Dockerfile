FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B clean package -DskipTests

# A Spring Boot fat jar nests its dependencies under BOOT-INF/lib/*.jar, so
# `java -cp app.jar com.microsoft.playwright.CLI` can't see the Playwright classes —
# they're not on the top-level classpath. The playwright.jar itself has no Main-Class
# manifest either (confirmed: `unzip -p playwright-1.49.0.jar META-INF/MANIFEST.MF` has
# no Main-Class line), so `java -jar` on it alone doesn't work. Instead, assemble
# Playwright's own dependency tree (confirmed via `mvn dependency:tree
# -Dincludes=com.microsoft.playwright`: exactly playwright + driver + driver-bundle, 3
# jars) into a lib/ folder and run the CLI class directly against that classpath — the
# officially supported invocation shape.
# NOTE: -DincludeArtifactIds=playwright on copy-dependencies only grabs the named
# artifact itself, not its transitive deps (verified — driver/driver-bundle were missing
# with that filter). -Dincludes (the *dependency:tree* style groupId:artifactId filter,
# applied here to copy-dependencies via -DincludeGroupIds) resolves the whole subtree
# instead, so all 3 jars land in the same place.
RUN mvn -B org.apache.maven.plugins:maven-dependency-plugin:3.6.1:copy-dependencies \
    -DincludeGroupIds=com.microsoft.playwright \
    -DoutputDirectory=/app/playwright-lib \
    -DincludeScope=runtime && \
    mvn -B org.apache.maven.plugins:maven-dependency-plugin:3.6.1:copy \
    -Dartifact=com.microsoft.playwright:playwright:1.49.0 \
    -DoutputDirectory=/app/playwright-lib

FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

# Playwright/Chromium runtime deps (headless PDF generation via document.HtmlPdfService)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk-bridge2.0-0 libx11-xcb1 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 libgtk-3-0 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/target/billbull-backend-*.jar app.jar
COPY --from=build /app/playwright-lib playwright-lib

ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN java -cp "playwright-lib/*" com.microsoft.playwright.CLI install --with-deps chromium && rm -rf playwright-lib

EXPOSE 8082
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
