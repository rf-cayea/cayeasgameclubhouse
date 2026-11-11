# Faith 3 store skins

Three permanent account-owned finishes style all 100 illustrated Faith 3 faces:
Moonlit Celestial (300 Clubhouse Cash), Jade Sanctuary (450), and Rose Quartz
(600). They overlay locally hosted, transparent painted frames on the original
religious artwork. Board faces, collection previews and held tray faces all use
the same equipped finish. Level layouts, obstacles and matching rules do not change.

Cash comes from the existing game-points conversion wallet. No points are minted
by purchases; lifetime earnings and each game's separate points stay unchanged.

## Existing Supabase project upgrade

Run only public/clubhouse-faith3-skins-upgrade.sql in the existing project's SQL
Editor. It is the new 20261102010000 migration, safe to retry, and preserves existing
wallets, purchases, equipment and game rewards. It adds catalog rows and extends
the existing transactional purchase/equip functions. Do not re-run the full initial
setup on an existing database. New projects use the updated combined setup file.

Purchases use catalog prices and a wallet row lock. Ownership and the debit commit
together; duplicate requests return already_owned without charging twice. Equipment
requires that the signed-in account owns an enabled item in the requested slot.
Original illumination is free. The game offers only owned premium skins and falls
back to the original if the account is absent, unowned or no longer verified.

The store offers previews before purchase, a confirmation dialog, balance and
insufficient-funds feedback, and Equip after ownership is confirmed. The game also
has a Tile skin selector. Account changes clear transient purchase state.

Validation includes real PostgreSQL permissions, balances, ownership, wrong-slot
and cross-account denials, simultaneous duplicate purchases, API receipt validation,
and browser purchase/equip/reload/collection-switch/sign-out/mobile checks against
fictional intercepted APIs. Browser fixtures never spend a real user's points.
