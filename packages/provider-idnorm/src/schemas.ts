import { z } from "zod";

export const IdNormCreateSessionResponseSchema = z.object({
  sessionId: z.string(),
  verificationUrl: z.string().url(),
  sessionToken: z.string(),
});

const CheckResultSchema = z.string().optional();

export const IdNormSessionResultsSchema = z.object({
  kyc: z.object({
    documentVerification: z.object({
      ageRestriction: CheckResultSchema,
      mrz: CheckResultSchema,
      barcode: CheckResultSchema,
      dataIntegrity: CheckResultSchema,
      allRequiredFieldsPresent: CheckResultSchema,
      documentLiveness: CheckResultSchema,
    }).optional(),
    faceMatch: z.object({
      faceMatch: CheckResultSchema,
      passiveLiveness: CheckResultSchema,
    }).optional(),
    liveness: z.object({
      userAction: CheckResultSchema,
      passiveLiveness: CheckResultSchema,
    }).optional(),
    ageEstimate: z.object({
      age: z.number().optional(),
      ageRestriction: CheckResultSchema,
    }).optional(),
    ipAnalysis: z.object({
      conditionsCheck: CheckResultSchema,
    }).optional(),
    poa: z.object({
      check: CheckResultSchema,
    }).optional(),
    aml: z.object({
      result: CheckResultSchema,
    }).optional(),
  }).optional(),
});

export const IdNormWebhookPayloadSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  sessionUpdate: z.object({
    status: z.string(),
    kyc: IdNormSessionResultsSchema.shape.kyc.optional(),
  }).optional(),
  documentExpired: z.object({
    expirationTimestamp: z.string().optional(),
  }).optional(),
  amlUpdated: z.object({
    result: z.string().optional(),
  }).optional(),
});
