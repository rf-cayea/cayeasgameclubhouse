import { createFileRoute, Link } from "@tanstack/react-router";
import { HubNav } from "@/components/HubNav";
import { GAMES, HUB_NAME, useClubhouse } from "@/lib/clubhouse";
import art from "@/assets/faith-art.svg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cayea's Game Clubhouse — Play, Earn Points, Unlock Rewards" },
      { name: "description", content: "Play Cayea's games, earn points in every game, and turn them into Clubhouse Cash for cosmetics and perks." },
      { property: "og:title", content: "Cayea's Game Clubhouse" },
      { property: "og:description", content: "One home for all of Cayea's games. Earn points by playing and unlock cosmetics and perks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Hub,
});

function Hub() {
  const { user, wallet, error } = useClubhouse();
  return (
    <>
      <HubNav />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <p role="status" className="mb-8 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">Play Rummy+ and Spades, or restore a monastery in 3 Gems of Buddhism. Sign in before an eligible card match to earn points. 3 Gems saves your journey and boosters on this device; Faith 3 is available for local practice.</p>
        {error && <p role="alert" className="mb-6 rounded-xl border border-border p-4 text-sm text-destructive">{error}</p>}
        <section className="grid items-center gap-8 md:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Welcome to</p>
            <h1 className="mt-2 font-display text-5xl leading-tight text-gold md:text-6xl">{HUB_NAME}</h1>
            <p className="mt-4 max-w-xl text-lg text-foreground/85">
              One home for every game we make. Play for free, collect rewards as you go, and make every game your own. Turn points from Rummy+ and Spades wins into Clubhouse Cash, or follow a 150-level journey to restore the monastery in 3 Gems of Buddhism.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/games/faith-3" className="btn-gold">Play Faith 3 Tile Match</Link>
              {user ? (
                <Link to="/store" className="chip self-center">⭐ {wallet?.rummy_points ?? 0} Rummy+ points · {wallet?.points ?? 0} Clubhouse Cash</Link>
              ) : (
                <Link to="/auth" className="btn-ghost-gold">Create a free account</Link>
              )}
            </div>
          </div>
          <img src={art} alt="Decorative Faith 3 tile illustration" width={768} height={1024} className="art-frame mx-auto max-h-96 w-auto max-w-full object-contain" />
        </section>

        <h2 className="mt-14 font-display text-3xl text-gold">Games</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {GAMES.map((g) => (
            <div key={g.slug} className={`card-hub ${g.status === "soon" ? "opacity-60" : ""}`}>
              <div className="text-4xl" aria-hidden="true">{g.icon}</div>
              <h3 className="mt-2 font-display text-2xl text-gold">{g.name}</h3>
              <p className="text-muted-foreground">{g.tagline}</p>
              {g.status === "live" ? (
                g.slug === "rummy" ? (
                  <Link to="/games/rummy" className="btn-gold mt-4 inline-block text-sm">Play Rummy+</Link>
                ) : g.slug === 'spades' ? (
                  <Link to="/games/spades" className="btn-gold mt-4 inline-block text-sm">Play Spades</Link>
                ) : g.slug === '3-gems' ? (
                  <Link to="/games/3-gems" className="btn-gold mt-4 inline-block text-sm">Play 3 Gems</Link>
                ) : (
                  <Link to="/games/faith-3" className="btn-gold mt-4 inline-block text-sm">Play now</Link>
                )
              ) : (
                <span className="chip mt-4 inline-block text-sm">Coming soon</span>
              )}
            </div>
          ))}
        </div>

        <h2 className="mt-14 font-display text-3xl text-gold">How points work</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="card-hub">
            <div className="text-2xl" aria-hidden="true">🎮</div>
            <h3 className="mt-1 font-display text-xl text-gold">Play</h3>
            <p className="text-sm text-muted-foreground">Win an eligible signed-in Rummy+ or Spades match: 40 points on Easy, 70 Normal, 120 Hard, or 150 against signed-in online human opponents.</p>
          </div>
          <div className="card-hub">
            <div className="text-2xl" aria-hidden="true">🏅</div>
            <h3 className="mt-1 font-display text-xl text-gold">Convert</h3>
            <p className="text-sm text-muted-foreground">Every 10 game points can become 7 Clubhouse Cash in your reward wallet. Your lifetime earnings stay the same.</p>
          </div>
          <div className="card-hub">
            <div className="text-2xl" aria-hidden="true">🛍</div>
            <h3 className="mt-1 font-display text-xl text-gold">Spend</h3>
            <p className="text-sm text-muted-foreground">Save 800 Rummy+ points for permanent Joker Mode in the Store. Converting those points reduces the balance available for this unlock.</p>
          </div>
        </div>
      </main>
    </>
  );
}
