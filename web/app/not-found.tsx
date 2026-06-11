import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container">
      <div className="trouble-note">
        <span className="stamp stamp-failed">misfiled</span>
        <h2>This page isn&apos;t in the catalog.</h2>
        <p>
          The address may be mistyped, or whatever lived here has been
          reshelved.
        </p>
        <Link href="/">← back to your decks</Link>
      </div>
    </main>
  );
}
