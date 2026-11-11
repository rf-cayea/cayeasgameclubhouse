// Isolated browser-test API. Never imported by the production application.
import { createGameServer } from '../server/http';
import { RoomStore } from '../server/rooms';
import { RummyError } from '../src/lib/rummy-protocol';

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const producerFixture=process.argv.includes('--producers');
let fixtureTime=Date.now();
if(producerFixture) Date.now=()=>fixtureTime;
const store = new RoomStore(':memory:');
const app = createGameServer({ store, origin: 'http://127.0.0.1:5174', verifyMember: async token => {
  if(producerFixture&&token.includes('|')) {const [identity,time]=token.split('|');token=identity!;if(ids.includes(token)&&Number.isFinite(Number(time)))fixtureTime=Number(time);}
  if (!ids.includes(token)) throw new RummyError('Fictional test identity required.', 401);
  return { principal: `member:${token}`, owned: [], jokers: false };
} });
if (process.argv.includes('--store')) {
  await app.economy.ensureMember({ principal: `member:${ids[0]}` }, { wallet: { points: 2000, rummy_points: 1000, spades_points: 1000, f3_points: 1000, gems_points: 1000, lifetime_points: 9000, owned: [], equipped: {}, pending_perks: {} }, awards: [] });
}
if(producerFixture) {
  await app.economy.ensureMember({principal:`member:${ids[0]}`},{wallet:{points:1000,gems_points:1000,rummy_points:0,spades_points:0,f3_points:0,lifetime_points:2000,owned:[],equipped:{},pending_perks:{}},awards:[]});
  for(let level=1;level<=40;level++)store.db.prepare("INSERT INTO economy_progress(user_id,game,level,stars,created_at) VALUES(?,'3-gems',?,3,0)").run(ids[0],level);
  store.db.prepare("INSERT INTO gems_monastery(user_id,completed_tasks,updated_at,workshop) VALUES(?,4,0,'{}')").run(ids[0]);
}
if (process.argv.includes('--monastery')) {
  // Explicit, fictional fifteen-clear fixture for workshop UI checks. The
  // unseeded puzzle_browser.py separately verifies actual clear proofs.
  await app.economy.ensureMember({ principal: `member:${ids[0]}` }, { wallet: { points: 0, rummy_points: 0, spades_points: 0, f3_points: 0, gems_points: 0, lifetime_points: 0, owned: [], equipped: {}, pending_perks: {} }, awards: [] });
  for (let level = 1; level <= 15; level++) store.db.prepare("INSERT INTO economy_progress(user_id,game,level,stars,created_at) VALUES(?,'3-gems',?,3,0)").run(ids[0], level);
  store.db.prepare("INSERT INTO gems_monastery(user_id,completed_tasks,updated_at,workshop) VALUES(?,0,0,'{}')").run(ids[0]);
}
app.server.listen(8788, '127.0.0.1', () => process.stdout.write('Isolated puzzle test API ready on8788.\n'));
process.on('SIGTERM', async () => { app.closeStreams(); await app.rewards.stop(); app.server.close(() => { store.close(); process.exit(0); }); });
