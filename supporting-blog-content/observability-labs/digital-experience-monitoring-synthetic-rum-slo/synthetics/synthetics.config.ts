import type { SyntheticsConfig } from '@elastic/synthetics';

export default () => {
  const config: SyntheticsConfig = {
    params: {
      url: 'https://<your-shop-url>',
    },
    monitor: {
      schedule: 3,
      locations: ['us_east', 'germany'],
      privateLocations: ['office-network'],
      // Alerting runs on the SLO burn rate rules, not on per-check status alerts.
      alert: { status: { enabled: false }, tls: { enabled: false } },
    },
    project: {
      id: 'bean-box-dem',
      url: process.env.KIBANA_URL,
      space: 'default',
    },
  };
  return config;
};
