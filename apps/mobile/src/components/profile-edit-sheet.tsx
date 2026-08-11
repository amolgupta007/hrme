import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MobileProfile } from "@jambahr/shared";
import { profileErrorCopy, useUpdateProfile, type ProfileUpdateBody } from "@/lib/profile";

/**
 * Profile edit bottom sheet (Task 7; WF-Request-Leave sheet pattern: grabber +
 * Cancel/Save header). Edits ONLY the mobile whitelist — phone, personal email,
 * emergency contact (name/phone/relationship), WhatsApp opt-in. PAN/Aadhaar,
 * names, DOB and work email are NOT here (view-broad / edit-narrow). Online-only
 * save via `useUpdateProfile`; a server rejection surfaces inline.
 */
export function ProfileEditSheet({
  visible,
  profile,
  orgId,
  onClose,
}: {
  visible: boolean;
  profile: MobileProfile;
  orgId: string | null | undefined;
  onClose: () => void;
}) {
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [personalEmail, setPersonalEmail] = useState(profile.personalEmail ?? "");
  const [ecName, setEcName] = useState(profile.emergencyContact.name ?? "");
  const [ecPhone, setEcPhone] = useState(profile.emergencyContact.phone ?? "");
  const [ecRel, setEcRel] = useState(profile.emergencyContact.relationship ?? "");
  const [whatsappOptIn, setWhatsappOptIn] = useState(profile.whatsappOptIn);
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useUpdateProfile(orgId);

  // Re-seed the form from the current profile each time the sheet opens.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setPhone(profile.phone ?? "");
      setPersonalEmail(profile.personalEmail ?? "");
      setEcName(profile.emergencyContact.name ?? "");
      setEcPhone(profile.emergencyContact.phone ?? "");
      setEcRel(profile.emergencyContact.relationship ?? "");
      setWhatsappOptIn(profile.whatsappOptIn);
      setServerError(null);
    }
  }

  const submit = () => {
    if (mutation.isPending) return;
    setServerError(null);
    const body: ProfileUpdateBody = {
      phone: phone.trim(),
      personalEmail: personalEmail.trim(),
      emergencyContact: {
        name: ecName.trim(),
        phone: ecPhone.trim(),
        relationship: ecRel.trim(),
      },
      whatsappOptIn,
    };
    mutation.mutate(body, {
      onSuccess: onClose,
      onError: (error) => setServerError(profileErrorCopy(error)),
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
          <Pressable
            onPress={() => {}}
            className="max-h-[90%] rounded-t-2xl border border-line bg-surface pb-8 pt-2"
          >
            {/* Grabber */}
            <View className="mb-2 h-1 w-9 self-center rounded-full bg-[#bbb]" />

            {/* Cancel / title / Save header */}
            <View className="mb-2 flex-row items-center justify-between px-4">
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                disabled={mutation.isPending}
                className="h-11 justify-center"
              >
                <Text className="text-[15px] text-ink-600">Cancel</Text>
              </Pressable>
              <Text className="text-[17px] font-semibold text-ink-900">Edit profile</Text>
              <Pressable
                accessibilityRole="button"
                onPress={submit}
                disabled={mutation.isPending}
                className="h-11 min-w-[64px] items-end justify-center"
              >
                {mutation.isPending ? (
                  <ActivityIndicator color="#17806D" />
                ) : (
                  <Text className="text-[15px] font-semibold text-brand">Save</Text>
                )}
              </Pressable>
            </View>

            <ScrollView
              className="px-4"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              <FieldLabel>Phone</FieldLabel>
              <Field
                value={phone}
                onChangeText={setPhone}
                placeholder="e.g. +91 98765 43210"
                keyboardType="phone-pad"
              />

              <FieldLabel>Personal email</FieldLabel>
              <Field
                value={personalEmail}
                onChangeText={setPersonalEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-ink-600">
                Emergency contact
              </Text>
              <FieldLabel>Name</FieldLabel>
              <Field value={ecName} onChangeText={setEcName} placeholder="Full name" />
              <FieldLabel>Phone</FieldLabel>
              <Field
                value={ecPhone}
                onChangeText={setEcPhone}
                placeholder="Contact number"
                keyboardType="phone-pad"
              />
              <FieldLabel>Relationship</FieldLabel>
              <Field value={ecRel} onChangeText={setEcRel} placeholder="e.g. Spouse, Parent" />

              {/* WhatsApp opt-in */}
              <View className="mt-5 flex-row items-center justify-between rounded-xl border border-line bg-surface px-3 py-3">
                <View className="flex-1 pr-3">
                  <Text className="text-[15px] font-medium text-ink-900">WhatsApp updates</Text>
                  <Text className="mt-0.5 text-[12px] text-ink-600">
                    Receive attendance & policy alerts on WhatsApp.
                  </Text>
                </View>
                <Switch
                  value={whatsappOptIn}
                  onValueChange={setWhatsappOptIn}
                  trackColor={{ true: "#17806D", false: "#E7E9EC" }}
                />
              </View>

              {serverError ? (
                <View className="mt-4 flex-row items-center rounded-xl bg-danger-tint px-3 py-2.5">
                  <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
                  <Text className="ml-2 flex-1 text-[13px] text-danger-ontint">{serverError}</Text>
                </View>
              ) : null}

              <View className="h-4" />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text className="mb-1.5 mt-3 text-[13px] font-medium text-ink-600">{children}</Text>;
}

function Field(props: React.ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      placeholderTextColor="#9AA1AB"
      className={`h-11 rounded-xl bg-surface px-3 text-[15px] text-ink-900 ${
        focused ? "border-[1.5px] border-brand" : "border border-line"
      }`}
    />
  );
}
