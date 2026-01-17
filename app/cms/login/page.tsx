import LoginForm from "@/components/cms/LoginForm";

export default function CmsLoginPage() {
  return (
    <main className="min-h-screen bg-neutral-100 px-6 py-16 text-neutral-900">
      <div className="mx-auto max-w-md text-center">
        <h1 className="mb-2 text-2xl font-semibold">KRTR Local CMS</h1>
        <p className="mb-8 text-sm text-neutral-500">
          Sign in with your admin account.
        </p>
      </div>
      <LoginForm />
    </main>
  );
}
