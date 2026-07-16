FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B clean package -DskipTests

FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

# Playwright/Chromium runtime deps (headless PDF generation via document.HtmlPdfService)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk-bridge2.0-0 libx11-xcb1 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 libgtk-3-0 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/target/billbull-backend-*.jar app.jar

ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN java -cp app.jar com.microsoft.playwright.CLI install --with-deps chromium

EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
