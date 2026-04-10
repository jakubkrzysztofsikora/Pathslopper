import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(baseConfig, defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/integration/**/*.test.ts"],
    exclude: [],
    testTimeout: 60_000,
  },
}));
