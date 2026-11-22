Build a dashboard called "Starlink edge fleet" for the Starlink dish metrics in metrics-starlink.otel-default. Each document comes from one edge site (site.name, site.type, site.region).

Layout, top to bottom:
- Filter controls for site.type and site.region.
- Row 1, four metric tiles: sites reporting (distinct site.name), median PoP latency in ms (starlink.dish.pop_ping.latency), average ping drop rate as a percentage (starlink.dish.pop_ping.drop_rate), and active dish alerts (sites where starlink.dish.alert.active is 1, with the alert.name).
- Row 2, side by side: PoP latency by site over time (line chart) and ping drop rate by site over time (line chart).
- Row 3, side by side: downlink throughput by site over time in Mbps (stacked area, starlink.dish.downlink.throughput is in bit/s) and obstruction fraction by site over time (line chart, starlink.dish.obstruction.fraction).
- Row 4: average dish power in watts by site (horizontal bar, starlink.dish.power) on the left, and a "Site health" table on the right with one row per site: average latency, average drop rate, max obstruction fraction and number of active alerts.
