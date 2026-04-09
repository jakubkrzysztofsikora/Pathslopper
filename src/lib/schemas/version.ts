import { z } from "zod";

export const VersionSchema = z.enum(["pf1e", "pf2e"]);

export type PathfinderVersion = z.infer<typeof VersionSchema>;
