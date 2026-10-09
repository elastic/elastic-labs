# Spring PetClinic on a real HotSpot JVM.
#
# The published springcommunity/spring-petclinic image for linux/arm64 is a GraalVM native
# image: one static binary, no libjvm.so. The OpenTelemetry eBPF profiler cannot unwind Java
# frames from a native image, so the flamegraph would stop at a single native frame. This
# build runs the same application as a plain jar on Eclipse Temurin (HotSpot), which the
# profiler does unwind, without any agent or JVM flags.

FROM maven:3.9-eclipse-temurin-21 AS build
RUN git clone --depth 1 https://github.com/spring-projects/spring-petclinic.git /src \
 && cd /src && git rev-parse HEAD > /src/COMMIT
WORKDIR /src
RUN ./mvnw -q -DskipTests package

FROM eclipse-temurin:21-jre
COPY --from=build /src/target/spring-petclinic-*.jar /app/petclinic.jar
COPY --from=build /src/COMMIT /app/COMMIT
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/petclinic.jar"]
