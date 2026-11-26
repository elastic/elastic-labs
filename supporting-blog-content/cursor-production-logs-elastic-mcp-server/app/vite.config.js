import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      proxy: {
        "/kibana_sample_data_ecommerce": {
          target: env.VITE_ELASTICSEARCH_URL,
          changeOrigin: true,
        },
      },
    },
  };
});
