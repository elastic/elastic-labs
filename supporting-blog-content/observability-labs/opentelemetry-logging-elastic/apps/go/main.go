package main

import (
	"context"
	"log"

	"go.opentelemetry.io/contrib/bridges/otelslog"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	sdklog "go.opentelemetry.io/otel/sdk/log"
)

func main() {
	ctx := context.Background()

	// Reads OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_EXPORTER_OTLP_HEADERS.
	exporter, err := otlploghttp.New(ctx)
	if err != nil {
		log.Fatal(err)
	}
	// The default resource reads OTEL_SERVICE_NAME and OTEL_RESOURCE_ATTRIBUTES.
	provider := sdklog.NewLoggerProvider(sdklog.WithProcessor(sdklog.NewBatchProcessor(exporter)))
	defer provider.Shutdown(ctx) // flushes the batch before exit

	logger := otelslog.NewLogger("checkout", otelslog.WithLoggerProvider(provider))
	logger.Info("Order accepted", "app.order.id", "demo-101", "app.amount", 42.5)
	logger.Warn("Payment retry scheduled", "app.order.id", "demo-102", "app.amount", 18.0)
	logger.Error("Payment rejected", "app.order.id", "demo-103", "app.amount", 72.0)
}
