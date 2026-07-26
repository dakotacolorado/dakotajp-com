import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/server/auth";
import { LoginForm } from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Admin sign in</h1>
      <LoginForm />
    </div>
  );
}
