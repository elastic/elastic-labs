/** @typedef {import('webpack').Configuration} WebpackConfiguration */

const sharedDependencies = {
  react: {
    singleton: true,
    requiredVersion: "^18.3.1",
    eager: true,
  },
  "react-dom": {
    singleton: true,
    requiredVersion: "^18.3.1",
    eager: true,
  },
  "react-router-dom": {
    singleton: true,
    requiredVersion: "^6.28.0",
    eager: true,
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