import type { SyntheticsConfig } from '@elastic/synthetics';

export default () => {
  const config: SyntheticsConfig = {
    params: {
      url: 'https://bean-box-production-0ad8.up.railway.app',
    },
    monitor: {
      schedule: 5,
      locations: ['us_east', 'germany'],
      privateLocations: ['office-network'],
      alert: {
        status: { enabled: false },
      },
    },
    project: {
      id: 'bean-box-checkout',
      url: process.env.KIBANA_URL,
      space: 'default',
    },
  };
  return config;
};
