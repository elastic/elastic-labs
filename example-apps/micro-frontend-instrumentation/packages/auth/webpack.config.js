const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { ModuleFederationPlugin } = require("webpack").container;
const {
  sharedDependencies,
  createDevServer,
} = require("../webpack-shared/federation-shared");

const PORT = 3001;
const publicPath =
  process.env.PUBLIC_PATH || `http://localhost:${PORT}/`;

module.exports = {
  entry: "./src/index.tsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    publicPath,
    clean: true,
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        options: { transpileOnly: true },
        exclude: /node_modules/,
      },
      { test: /\.css$/i, use: ["style-loader", "css-loader"] },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      "process.env.AUTH_API_URL": JSON.stringify(
        process.env.AUTH_API_URL || "http://localhost:4000"
      ),
    }),
    new ModuleFederationPlugin({
      name: "auth",
      filename: "remoteEntry.js",
      exposes: {
        "./App": "./src/App",
      },
      shared: sharedDependencies,
    }),
    new HtmlWebpackPlugin({ template: "./public/index.html" }),
  ],
  devServer: createDevServer({ name: "auth", port: PORT }),
};