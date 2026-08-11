import { useLocalSearchParams } from "expo-router";
import { PersonProfileScreen } from "@/components/people/person-profile-screen";

export default function PersonProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PersonProfileScreen id={id} />;
}
