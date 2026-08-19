import { Navigation } from "@/components/layout/navigation";
import { getCurrentUser } from "@/lib/data/current-user";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-background">
      <Navigation user={user} />

      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Profile</h1>
          <p className="text-muted-foreground">Manage your account details</p>
        </div>

        <ProfileForm user={user} />
      </div>
    </div>
  );
}
