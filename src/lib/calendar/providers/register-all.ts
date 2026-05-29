/**
 * Side-effecting wiring module. Importing this file registers every
 * concrete calendar provider into the registry from `./index`.
 *
 * Server entry points (route handlers, server actions) import this file
 * once at startup, before any code path that calls `getProvider`. The
 * 2d OAuth route is the first such entry point; 2c ships this module
 * but does not yet import it from any production code path.
 */
import { registerProvider } from "./index";
import { googleCalendarProvider } from "./google";

registerProvider(googleCalendarProvider);
