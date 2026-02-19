export default function Footer() {
  return (
    <footer className="mt-10 border-t border-black/10 bg-white">
      <div className="mx-auto max-w-site px-4 py-6 text-sm">
        <p className="mb-3">
          <a
            href="/submit-story"
            className="underline"
          >
            Share pictures, videos, tips, events, birthdays, and anniversaries
          </a>{" "}
          | <a href="/about">About Us</a> |{" "}
          <a href="/termsprivacy">Terms of Use</a> |{" "}
          <a href="/advertise">Advertise with KRTR Local</a>
        </p>
        <p>KRTR Local, LLC - 502 Main Street, La Porte City, IA 50651 - 319-486-1525</p>
      </div>
    </footer>
  );
}
