import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/**
 * MSW server for vitest unit/component tests.
 * Wire into vitest.setup.ts via:
 *   import "@/tests/msw/server";
 *   (or import the server export and call setup methods manually)
 *
 * See vitest.setup.ts for the beforeAll/afterEach/afterAll lifecycle wiring.
 */
export const server = setupServer(...handlers);
