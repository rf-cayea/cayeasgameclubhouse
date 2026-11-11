/** Fictional identity verifier for loopback browser QA only; real production HTTP/SQLite stores. */
import {RoomStore} from '../../server/rooms';
import {createGameServer} from '../../server/http';
import {EconomyStore} from '../../server/economy';
import {nodeSocialBinding} from '../../server/social-node';
const ids=Array.from({length:4},(_,n)=>`${n+1}1111111-1111-4111-8111-111111111111`);
// Match the standard fictional browser accounts.
ids[1]='22222222-2222-4222-8222-222222222222';ids[2]='33333333-3333-4333-8333-333333333333';ids[3]='44444444-4444-4444-8444-444444444444';
const roomStore=new RoomStore(':memory:');let economy:EconomyStore;
const app=createGameServer({store:roomStore,verifyMember:async token=>{
 const sub=JSON.parse(Buffer.from(token.split('.')[1]??'','base64url').toString()).sub;
 if(!ids.includes(sub))throw new Error('Fictional QA member required.');
 const actor={principal:`member:${sub}`,jokers:false},wallet=await economy.wallet(actor);return {...actor,owned:wallet.owned};
}});
economy=new EconomyStore(nodeSocialBinding(roomStore.db));
for(const id of ids)await economy.ensureMember({principal:`member:${id}`},{wallet:{dice_points:1200,points:1000,owned:[],equipped:{}},awards:[]});
app.server.listen(8813,'127.0.0.1',()=>console.log('Fast Farkle HTTP QA ready on 8813'));
process.on('SIGTERM',async()=>{app.closeStreams();await app.rewards.stop();app.server.close(()=>{roomStore.close();process.exit(0);});});
