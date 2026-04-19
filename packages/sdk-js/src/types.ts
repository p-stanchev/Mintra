// Minimal Zod schema interface — avoids importing zod directly in the SDK
export interface ZodSchema<T> {
  parse(data: unknown): T;
}
