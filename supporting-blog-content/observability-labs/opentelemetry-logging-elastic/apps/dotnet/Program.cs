using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry.Logs;

var builder = Host.CreateApplicationBuilder(args);
builder.AddElasticOpenTelemetry();
builder.Services.Configure<OpenTelemetryLoggerOptions>(o => o.IncludeFormattedMessage = true);

using var host = builder.Build();
var logger = host.Services.GetRequiredService<ILoggerFactory>().CreateLogger("checkout");

logger.LogInformation("Order accepted: {app.order.id}, amount {app.amount}", "demo-101", 42.5);
logger.LogWarning("Payment retry scheduled: {app.order.id}, amount {app.amount}", "demo-102", 18.0);
logger.LogError("Payment rejected: {app.order.id}, amount {app.amount}", "demo-103", 72.0);
// Disposing the host flushes the logs before the program exits.
