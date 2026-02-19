import StorySubmissionForm from "@/components/public/StorySubmissionForm";

export const dynamic = "force-dynamic";

export default function SubmitStoryPage() {
  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <section className="rounded-lg bg-white p-6">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">Submit a Story</h1>
          <p className="text-sm text-neutral-600">
            Submit a story for review. Submissions are saved as draft and reviewed
            by our team before publishing.
          </p>
        </header>
        <StorySubmissionForm />
      </section>
    </main>
  );
}
