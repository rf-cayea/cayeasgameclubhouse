import { createFileRoute, Link } from "@tanstack/react-router";
import { HubNav } from "@/components/HubNav";
import { GAMES, HUB_NAME, useClubhouse } from "@/lib/clubhouse";
import { AnimatedClubhouseLogo } from "@/components/ClubhouseLogo";

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

        {error && <p role="alert" className="mb-6 rounded-xl border border-border p-4 text-sm text-destructive">{error}</p>}
        <section className="grid items-center gap-8 md:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Welcome to</p>
            <h1 className="mt-2 font-display text-5xl leading-tight text-gold md:text-6xl">{HUB_NAME}</h1>
            <p className="mt-4 max-w-xl text-lg text-foreground/85">
              One home for every game we make. Play for free, collect rewards as you go, and make every game your own. Turn points from all eleven games into Clubhouse Cash, or follow a 200-level journey to restore the monastery in 3 Gems of Buddhism.
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
          <AnimatedClubhouseLogo />
        </section>

        <p role="status" className="mt-8 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">Play Crown &amp; Chance, Crown &amp; Court, Rummy+, Spades and Quintsee, or restore a monastery in 3 Gems of Buddhism. Sign in before an eligible match to earn points. Guests can try the puzzles; signed-in puzzle runs save verified first clears and rewards to your account.</p>

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
                ) : g.slug === 'dominoes' ? (
                  <Link to="/games/dominoes" className="btn-gold w-full justify-center">Play Dominoes →</Link>
                ) : g.slug === 'crown-chance' ? (
                  <Link to="/games/crown-chance" className="btn-gold mt-4 inline-block text-sm">Play Crown &amp; Chance</Link>
                ) : g.slug === 'crown-court' ? (
                  <Link to="/games/crown-court" className="btn-gold mt-4 inline-block text-sm">Play Crown &amp; Court</Link>
                ) : g.slug === 'carrom' ? (<Link to="/games/carrom" className="btn-gold mt-4 inline-block text-sm">Play Carrom &amp; Disc Pool</Link>) : g.slug === 'backgammon' ? (<Link to="/games/backgammon" className="btn-gold mt-4 inline-block text-sm">Play Backgammon</Link>) : g.slug === 'farkle' ? (
                  <Link to="/games/farkle" className="btn-gold mt-4 inline-block text-sm">Play Farkle</Link>
                ) : g.slug === 'five-dice' ? (
                  <Link to="/games/quintsee" className="btn-gold mt-4 inline-block text-sm">Play Quintsee</Link>
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
            <p className="text-sm text-muted-foreground">Clear Faith 3 or 3 Gems levels, or win full Rummy+ and Spades matches. Achievements add game points and Clubhouse Cash bonuses.</p>
          </div>
          <div className="card-hub">
            <div className="text-2xl" aria-hidden="true">🏅</div>
            <h3 className="mt-1 font-display text-xl text-gold">Convert</h3>
            <p className="text-sm text-muted-foreground">Exchange 13 game points for 10 Clubhouse Cash. Each Cash has 30% more buying power per unit. Converting leaves lifetime earnings unchanged.</p>
          </div>
          <div className="card-hub">
            <div className="text-2xl" aria-hidden="true">🛍</div>
            <h3 className="mt-1 font-display text-xl text-gold">Spend</h3>
            <p className="text-sm text-muted-foreground">Shared card decks cost 563 Rummy+ or Spades points, or 434 Cash. Buy once and use them in both card games. Joker Mode and Spades Partnerships each cost 500 game points or 385 Cash.</p>
          </div>
        </div>
        <section className="home-about" aria-labelledby="home-about-title"><div><h2 id="home-about-title">New to the Clubhouse?</h2><p>Get to know all eleven games, monastery restoration, points, Clubhouse Cash, shared decks, achievements, profiles, and playing with friends.</p></div><Link to="/about" className="btn-ghost-gold">About &amp; player guide →</Link></section>
      </main>
    </>
  );
}
