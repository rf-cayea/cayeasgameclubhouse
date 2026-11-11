# Monastery stories and quotation sources

Anika, the four monasteries, resident teachers, and NPC buyers are fictional.
The story discusses the real Three Jewels: Buddha, Dharma, and Sangha.
Its four architectural chapters draw from Sri Lankan Theravada, Chinese
Mahayana, Tibetan Vajrayana, and Japanese Zen. These labels describe
tradition-inspired settings, rather than four mutually exclusive branches:
Zen belongs to Mahayana, and Tibetan Buddhism includes Mahayana and Vajrayana.
Architectural forms and customs vary within each tradition.

All scripture excerpts in `src/lib/buddhist-quotes.ts` are verbatim excerpts
from Bhikkhu Sujato's English translations, checked against SuttaCentral's
published Bilara text on 3 November 2026. Line-break markers and trailing spaces
are normalized; excerpt references identify shortened passages.

- [Dhammapada 1–20: verses 2, 5, and 16](https://raw.githubusercontent.com/suttacentral/bilara-data/published/translation/en/sujato/sutta/kn/dhp/dhp1-20_translation-en-sujato.json)
- [Dhammapada 179–196: verses 183, 184, and 194](https://raw.githubusercontent.com/suttacentral/bilara-data/published/translation/en/sujato/sutta/kn/dhp/dhp179-196_translation-en-sujato.json)
- [Mettā Sutta, Sutta Nipāta 1.8: sections 3, 6, 7, and 8](https://raw.githubusercontent.com/suttacentral/bilara-data/published/translation/en/sujato/sutta/kn/snp/vagga1/snp1.8_translation-en-sujato.json)

These translations use the **CC0 public-domain dedication**. The official
[Bilara README](https://github.com/suttacentral/bilara-data/blob/published/README.md)
states that the license must be CC0 and that all translations supported by
SuttaCentral must use that license. Each displayed quote links to its canonical
text/verse and explicitly names the translator and CC0 dedication. The original
game narration is visually separate from scripture quotations. “Sutta” is the
Pali counterpart of Sanskrit “sutra.”

Restoration stars and crafting supplies are fictional game resources, separate
from Clubhouse Cash. Each verified first clear grants one restoration star and
three supplies. The 200-level journey has four chapters of 50 levels. Fifty missions cost
exactly 200 stars: 50 for each monastery and village. Previously paid repairs
receive a one-time, saved restoration credit so no completed work is charged
again. Welcoming monks and nuns means preparing a place for fictional teachers; it does not represent
buying, hiring, or ordaining real monastics.


Each tradition-inspired monastery has a fictional lay village with a separate
resource pantry: wood, grain, vegetables, plant fiber, and herbs. Villagers
produce these resources through player harvest actions, capped at 32 of each
per village. Production now has saved cooldowns and upgrades, described below. Cooking spends grain, vegetables, herbs, and firewood. Beadwork,
book covers, cushions, bowls, and benches spend their listed physical materials.
Meals offered as alms to monks or nuns, or shared with lay families, consume
stock. Each group’s first alms offering gives two supplies; three one-time lay
support missions give two, three, or four supplies. Repeated offerings give no
further supplies. These activities never award real wallet points or cash.

The Sangha has traditional monastic and noble-disciple meanings and a wider
community-of-practice usage. The villages explicitly celebrate the fourfold
community of monks, nuns, lay women, and lay men. The four illustrated villages
are fictional, inspired by Sri Lankan Theravada, Chinese Mahayana, Tibetan
Vajrayana, and Japanese Zen settings. Zen and Tibetan Buddhism also belong to
the broader Mahayana world; these are four settings rather than four mutually
exclusive branches. Names, customs, architecture, and crops are illustrative.

From level 4, newly started gem boards use contiguous obstacle barriers: a full
middle wall, split columns, staggered gates, a cross, and terrace walls. Block
counts grow from eight to eighteen; double layers begin at level 12 and triple
layers at level 60, alongside existing seals and chains. All blocks remain level
objectives. Adjacent matches remove a layer; hammers and mixed specials can open
routes through a barrier. Existing guest boards and server reward runs retain
their original rule version, preserving saves and replay verification.

After a win, Next level appears before optional reward details. Repair notices
check both the star cost and any required craft order. Village notices count
currently available NPC deliveries, lay support missions, and first alms
opportunities. Closing the result dialog leaves these destinations and level
navigation available on the board; level 200 offers a visit to the monasteries.


The community uses a persistent section menu with a bounded content panel:
repairs, before/after artwork, village map, resource producers, housing,
kitchen/woodwork, crafts/NPC orders, alms/neighbours, and story/scripture. The
level map shows one fifty-level chapter at a time. This preserves the full
journey while avoiding a single long page of village content.

Each of the four resource producers starts at level 1 with one worker. Base
cooldowns are 60 seconds for the woodlot and fiber garden, 90 seconds for the
farm, and 75 seconds for herbs. Each upgrade (maximum level 5) increases yield
and shortens the next cooldown by 8% of its base duration. Costs are listed in
materials and community supplies; upgrades never remove a running cooldown.
Every village starts with one home/four beds. Two additional homes provide
two beds each, for eight workers total. Each producer has at most two workers.
Permanent second-worker unlocks cost 300 Gem points or 231 Clubhouse Cash each
and apply to that producer in all four villages. A purchased worker still needs
a free local bed before being welcomed. Two workers double the harvest.

Signed-in cooldowns use the server clock and saved, atomically updated producer
records. Identical retries return the previous receipt; concurrent fresh
requests cannot harvest twice within a cooldown. Guest cooldowns persist on the
device. Existing inventories, crafted goods, completed repairs, and wallet
balances survive normalization of old saves.

Decorative animations follow confirmed state changes: alms offerings to monks
and nuns, sharing a family meal, supplying the kitchen, setting out a study
bench, building housing, welcoming a second worker, cooking, gathering, and
monastery repairs. Reloading saved progress does not replay celebrations. The
illustrations are original fictional game artwork; reduced-motion preferences
show the confirmation illustration and caption without movement.
