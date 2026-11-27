const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { ModuleFederationPlugin } = require("webpack").container;
const {
  sharedDependencies,
  createDevServer,
} = require("../webpack-shared/federation-shared");

const PORT = 3000;
const authRemote =
  process.env.AUTH_REMOTE_URL || `http://localhost:3001/remoteEntry.js`;
const dashboardRemote =
  process.env.DASHBOARD_REMOTE_URL ||
  `http://localhost:3002/remoteEntry.js`;
const photoRemote =
  process.env.PHOTO_REMOTE_URL || `http://localhost:3003/remoteEntry.js`;

module.exports = {
  entry: "./src/index.tsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    publicPath: process.env.PUBLIC_PATH || `http://localhost:${PORT}/`,
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
    new ModuleFederationPlugin({
      name: "shell",
      remotes: {
        auth: `auth@${authRemote}`,
        dashboard: `dashboard@${dashboardRemote}`,
        photo: `photo@${photoRemote}`,
      },
      shared: sharedDependencies,
    }),
    new HtmlWebpackPlugin({ template: "./public/index.html" }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, "public/vendor"),
          to: path.resolve(__dirname, "dist/vendor"),
        },
      ],
    }),
  ],
  devServer: {
    ...createDevServer({ name: "shell", port: PORT }),
    static: [
      {
        directory: path.resolve(__dirname, "public"),
        publicPath: "/",
      },
    ],
  },
};