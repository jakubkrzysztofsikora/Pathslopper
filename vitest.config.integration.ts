import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(baseConfig, defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/integration/**/*.test.ts"],
    exclude: [],
    testTimeout: 180_000, // 3 min — real 6-stage generator takes 60-120s against Scaleway
    // Run integration test files one at a time. Every integration test
    // file that touches Redis calls `store._reset()` in afterAll, which
    // deletes every `pfnexus:session:*` key across the whole instance.
    // When vitest runs files in parallel (the default), file A's
    // afterAll can fire while file B is still mid-test and silently wipe
    // file B's session, producing "undefined" on the next read. Force
    // sequential file execution so each file's setup/teardown is
    // atomic with respect to every other file.
    fileParallelism: false,
  },
}));
