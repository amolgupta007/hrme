import { z } from "zod";

/**
 * Body for POST /api/mobile/account/deletion-request. Everything is optional —
 * the request target is ALWAYS the caller (`user.employeeId`, self by
 * construction; no target field). `reason` is stored verbatim in
 * `account_deletion_requests.note`.
 */
export const AccountDeletionRequestBodySchema = z.object({
  reason: z.string().trim().max(500, "Reason is too long").optional(),
});

export type AccountDeletionRequestBody = z.infer<
  typeof AccountDeletionRequestBodySchema
>;

/** Shape returned by both POST and GET for a live pending request. */
export type MobileDeletionRequest = {
  status: "pending";
  requestedAt: string;
};
