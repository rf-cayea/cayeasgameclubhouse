import { createFileRoute, Link } from "@tanstack/react-router";
import { HubNav } from "@/components/HubNav";

export const Route = createFileRoute("/friends")({ component: FriendsPage });

function FriendsPage() {
  return <><HubNav /><main className="mx-auto max-w-3xl px-4 py-10">
    <h1 className="font-display text-4xl text-gold">Friends</h1>
    <section className="card-hub mt-6">
      <h2 className="font-display text-2xl text-gold">Friend connections are still being set up</h2>
      <p className="mt-3 text-muted-foreground">Adding friends isn’t available in this version yet. Once friend connections are connected, their latest wins will appear in the Clubhouse.</p>
      <Link to="/clubhouse" className="btn-ghost-gold mt-4 inline-block">Back to the Clubhouse</Link>
    </section>
  </main></>;
}
