FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
COPY src ./src
RUN mvn -q -B package

FROM eclipse-temurin:21-jre
WORKDIR /app
ADD https://repo1.maven.org/maven2/co/elastic/otel/elastic-otel-javaagent/1.13.0/elastic-otel-javaagent-1.13.0.jar elastic-otel-javaagent.jar
COPY --from=build /src/target/checkout.jar target/checkout.jar
ENV OTEL_INSTRUMENTATION_LOGBACK_APPENDER_EXPERIMENTAL_CAPTURE_KEY_VALUE_PAIR_ATTRIBUTES=true
CMD ["java", "-javaagent:elastic-otel-javaagent.jar", "-jar", "target/checkout.jar"]
