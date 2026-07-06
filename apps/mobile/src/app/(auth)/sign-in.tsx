import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
} from "react-native";
import { useSignIn } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { normalizePhone } from "@jambahr/shared/phone";

type Stage = "identifier" | "code" | "password";

export default function SignIn() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<Stage>("identifier");
  const [codeStrategy, setCodeStrategy] = useState<"email_code" | "phone_code">("email_code");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isLoaded) return null;

  const isEmail = identifier.includes("@");

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const id = isEmail
        ? identifier.trim()
        : (normalizePhone(identifier) ?? identifier.trim());
      const attempt = await signIn!.create({ identifier: id });
      const factors = attempt.supportedFirstFactors ?? [];

      const phoneFactor = factors.find((f) => f.strategy === "phone_code");
      const emailFactor = factors.find((f) => f.strategy === "email_code");
      const passwordFactor = factors.find((f) => f.strategy === "password");

      if (!isEmail && phoneFactor && "phoneNumberId" in phoneFactor) {
        await signIn!.prepareFirstFactor({
          strategy: "phone_code",
          phoneNumberId: phoneFactor.phoneNumberId,
        });
        setCodeStrategy("phone_code");
        setStage("code");
      } else if (emailFactor && "emailAddressId" in emailFactor) {
        await signIn!.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: emailFactor.emailAddressId,
        });
        setCodeStrategy("email_code");
        setStage("code");
      } else if (passwordFactor) {
        setStage("password");
      } else {
        setError("No supported sign-in method for this account.");
      }
    } catch (e: unknown) {
      setError(clerkMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function finish(
    attemptPromise: Promise<{ status: string | null; createdSessionId: string | null }>
  ) {
    setBusy(true);
    setError(null);
    try {
      const attempt = await attemptPromise;
      // TODO(spike): remove diagnostics after device checkpoint passes
      console.log(
        "[spike] verify result — status:",
        attempt.status,
        "sessionId:",
        attempt.createdSessionId ? "present" : "null"
      );
      if (attempt.status === "complete" && attempt.createdSessionId) {
        await setActive!({ session: attempt.createdSessionId });
        console.log("[spike] setActive done, navigating to /");
        router.replace("/");
      } else {
        setError("Additional verification required — contact your admin.");
      }
    } catch (e: unknown) {
      setError(clerkMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 justify-center bg-background px-6"
    >
      <Text className="text-2xl font-bold text-foreground">JambaHR</Text>
      <Text className="mb-8 mt-1 text-sm text-muted-foreground">
        Sign in with your work email or phone
      </Text>

      {stage === "identifier" && (
        <>
          <TextInput
            className="rounded-lg border border-input bg-card px-4 py-3 text-base text-foreground"
            placeholder="Email or phone number"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={identifier}
            onChangeText={setIdentifier}
          />
          <SubmitButton label="Continue" busy={busy} onPress={start} disabled={!identifier.trim()} />
        </>
      )}

      {stage === "code" && (
        <>
          <Text className="mb-2 text-sm text-muted-foreground">
            Enter the code sent to {identifier.trim()}
          </Text>
          <TextInput
            className="rounded-lg border border-input bg-card px-4 py-3 text-base text-foreground"
            placeholder="Verification code"
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
          />
          <SubmitButton
            label="Verify"
            busy={busy}
            disabled={code.length < 4}
            onPress={() =>
              void finish(signIn!.attemptFirstFactor({ strategy: codeStrategy, code }))
            }
          />
        </>
      )}

      {stage === "password" && (
        <>
          <TextInput
            className="rounded-lg border border-input bg-card px-4 py-3 text-base text-foreground"
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <SubmitButton
            label="Sign in"
            busy={busy}
            disabled={!password}
            onPress={() =>
              void finish(signIn!.attemptFirstFactor({ strategy: "password", password }))
            }
          />
        </>
      )}

      {error && <Text className="mt-4 text-sm text-destructive">{error}</Text>}
    </KeyboardAvoidingView>
  );
}

function SubmitButton({
  label,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  busy: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      className={`mt-4 items-center rounded-lg bg-primary py-3 ${disabled === true || busy ? "opacity-50" : ""}`}
      disabled={disabled === true || busy}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text className="text-base font-semibold text-primary-foreground">{label}</Text>
      )}
    </Pressable>
  );
}

function clerkMessage(e: unknown): string {
  const err = e as { errors?: { longMessage?: string; message?: string }[] };
  return (
    err?.errors?.[0]?.longMessage ??
    err?.errors?.[0]?.message ??
    "Sign-in failed. Please try again."
  );
}
