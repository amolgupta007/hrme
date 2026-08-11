import * as LocalAuthentication from "expo-local-authentication";

/**
 * Biometric confirm step in front of a sensitive mobile action (D4: payroll
 * disbursement approve). Never throws — any failure (no hardware, nothing
 * enrolled, a thrown error from the native module) resolves `false` so the
 * caller can fall back to "approve on web" rather than crash the approve flow.
 */
export async function confirmBiometric(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Confirm to approve payroll",
    });
    return result.success;
  } catch {
    return false;
  }
}
