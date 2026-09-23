import { z } from "zod";

const sourceManagementStatusSchema = z.enum([
  "DEFAULT",
  "PRIORITIZED",
  "BLOCKED",
]);

export type SourceManagementStatus = z.infer<
  typeof sourceManagementStatusSchema
>;

export function parseSourceManagementStatus(value: unknown) {
  return sourceManagementStatusSchema.parse(value);
}
