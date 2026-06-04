import {
  cleanPublicClientUsername,
  PublicClientProfileContent,
  readPublicClientProfile
} from "@/components/marketplace/public-client-profile";

export default async function PublicClientProfilePage({ params }: { params: Promise<{ username: string }>; }) {
  const { username: rawUsername } = await params;
  const username = cleanPublicClientUsername(rawUsername) || "client";
  const profile = await readPublicClientProfile(username);

  return (
    <main>
      <PublicClientProfileContent profile={profile} username={username} />
    </main>
  );
}
