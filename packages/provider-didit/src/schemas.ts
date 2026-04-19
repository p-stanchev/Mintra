import { z } from "zod";

export const DiditSessionResponseSchema = z.object({
  session_id: z.string(),
  session_number: z.union([z.string(), z.number()]).optional(),
  session_token: z.string(),
  verification_url: z.string().url().optional(),
  url: z.string().url().optional(),
  vendor_data: z.string().optional(),
  status: z.string(),
  workflow_id: z.string().optional(),
});
export type DiditSessionResponse = z.infer<typeof DiditSessionResponseSchema>;

export const DiditWebhookPayloadSchema = z.object({
  session_id: z.string(),
  status: z.string(),
  webhook_type: z.string(),
  vendor_data: z.string().optional(), // echoed userId when provided
  timestamp: z.number().optional(),
  workflow_id: z.string().optional(),
  decision: z
    .object({
      id_verification: z
        .object({
          status: z.string(),
          document_type: z.string().optional(),
          country: z.string().optional(),
        })
        .optional(),
      face_match: z.object({ status: z.string() }).optional(),
      liveness: z.object({ status: z.string() }).optional(),
      aml_screening: z.object({ status: z.string() }).optional(),
    })
    .optional(),
});
export type DiditWebhookPayload = z.infer<typeof DiditWebhookPayloadSchema>;
