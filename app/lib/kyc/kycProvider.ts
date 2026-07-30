// KYC provider seam.
//
// Phase 1 decision (owner): KYC is STUBBED — a mock "verified" flow — because
// the real vendor and legal entity are being sorted in parallel. The real
// provider (Aadhaar via DigiLocker/offline-QR + DL fallback + liveness selfie,
// PRD 2.2) drops in later by writing a class that implements this interface
// and swapping the `kyc` export at the bottom. No calling code changes.
//
// We only ever keep the MINIMAL verified fields (PRD 2.2): verified · name ·
// over-18 flag · opaque token. Never a raw Aadhaar number.

export type KycIdType = 'aadhaar' | 'driving_licence';

export type KycResult = {
  /** Legal name as read from the ID (mock: what the user typed). */
  verifiedName: string;
  over18: boolean;
  /** Opaque provider reference — never a raw ID number. */
  token: string;
};

export interface KycProvider {
  /** True while this is the mock. UI uses it to show an honest "demo" note. */
  readonly isStub: boolean;
  /**
   * Runs verification. The real provider opens the vendor SDK/webview
   * (ID scan + liveness) and returns the extracted fields; the stub simulates
   * it. Rejects if the user cancels or verification fails.
   */
  verify(input: { name: string; idType: KycIdType }): Promise<KycResult>;
}

class StubKycProvider implements KycProvider {
  readonly isStub = true;

  async verify({ name }: { name: string; idType: KycIdType }): Promise<KycResult> {
    // Simulate the provider round-trip so the flow feels real in testing.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const token = `stub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return { verifiedName: name.trim(), over18: true, token };
  }
}

// The single place the app gets its KYC provider. Swap this line for the real
// implementation when the vendor is chosen.
export const kyc: KycProvider = new StubKycProvider();
