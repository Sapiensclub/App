// Phone-OTP provider seam.
//
// Phase 0 decision (owner): email OTP is the only real auth path. Phone OTP is
// STUBBED so SMS is never a Phase 0 dependency. The real provider (Supabase
// phone auth backed by an Indian DLT-registered SMS gateway — MSG91 / etc.)
// drops in later, alongside KYC, by writing a class that implements this same
// interface and swapping the export at the bottom. No calling code changes.

export interface PhoneOtpProvider {
  /** Send a one-time code to an E.164 phone number (e.g. "+9198…"). */
  sendCode(phoneE164: string): Promise<void>;
  /** Verify the code the user typed. Resolves on success, throws on failure. */
  verifyCode(phoneE164: string, code: string): Promise<void>;
}

/** Raised by the stub so the UI can show a clear "not available yet" message. */
export class PhoneOtpNotAvailableError extends Error {
  constructor() {
    super('Phone sign-in is coming soon. Please use email for now.');
    this.name = 'PhoneOtpNotAvailableError';
  }
}

class StubPhoneOtpProvider implements PhoneOtpProvider {
  async sendCode(): Promise<void> {
    throw new PhoneOtpNotAvailableError();
  }
  async verifyCode(): Promise<void> {
    throw new PhoneOtpNotAvailableError();
  }
}

// The single place the app gets its phone-OTP provider. Swap this line for the
// real implementation when SMS + DLT are ready.
export const phoneOtp: PhoneOtpProvider = new StubPhoneOtpProvider();
