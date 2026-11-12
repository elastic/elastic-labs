FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod main.go ./
RUN go get go.opentelemetry.io/contrib/bridges/otelslog \
      go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp \
      go.opentelemetry.io/otel/sdk/log \
 && go mod tidy && CGO_ENABLED=0 go build -o /checkout .

FROM gcr.io/distroless/static-debian12
COPY --from=build /checkout /checkout
CMD ["/checkout"]
