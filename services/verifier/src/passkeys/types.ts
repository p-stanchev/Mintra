import type {
  PasskeyBinding,
  PasskeyRegistrationChallenge,
} from "@mintra/sdk-types";

export interface StoredPasskeyBinding extends PasskeyBinding {
  rpId: string;
  origin: string;
}

export interface PendingPasskeyRegistration extends PasskeyRegistrationChallenge {
  deviceName: string | null;
}

export interface PasskeyBindingStore {
  upsertBinding(binding: StoredPasskeyBinding): Promise<void>;
  getBindingById(bindingId: string): Promise<StoredPasskeyBinding | null>;
  getBindingForWallet(walletAddress: string): Promise<StoredPasskeyBinding | null>;
  updateBindingCounter(bindingId: string, counter: number, updatedAt: string): Promise<void>;
  issuePendingRegistration(challenge: PendingPasskeyRegistration): Promise<void>;
  consumePendingRegistration(registrationId: string): Promise<PendingPasskeyRegistration | null>;
  close(): Promise<void>;
}
