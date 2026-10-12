export default function Notice({ notice, error }: { notice?: string; error?: string }) {
 return <>{notice && <p role="status" className="success">{notice === "accepted" ? "Invitation accepted." : "Saved."}</p>}{error && <p role="alert" className="error">{error}</p>}</>;
}
