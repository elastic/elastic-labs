/** @typedef {import('webpack').Configuration} WebpackConfiguration */

const sharedDependencies = {
  react: {
    singleton: true,
    requiredVersion: "^18.3.1",
    eager: false,
  },
  "react-dom": {
    singleton: true,
    requiredVersion: "^18.3.1",
    eager: false,
  },
  "react-router-dom": {
    singleton: true,
    requiredVersion: "^6.28.0",
    eager: false,
  },
  "@opentelemetry/api": {
    singleton: true,
    requiredVersion: "^1.9.0",
    eager: true,
  },
};

/**
 * @param {{ name: string; port: number }} options
 */
function createDevServer(options) {
  return {
    port: options.port,
    historyApiFallback: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    hot: true,
  };
}

module.exports = { sharedDependencies, createDevServer };