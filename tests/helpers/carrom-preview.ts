/** Loopback-only integration preview: real Node routes, isolated data, fictional members. */
import {RoomStore} from '../../server/rooms';
import {createGameServer} from '../../server/http';
import {RummyError} from '../../src/lib/rummy-protocol';
const store=new RoomStore(':memory:'),ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const app=createGameServer({store,verifyMember:async token=>{let id:string;try{id=JSON.parse(Buffer.from(token.split('.')[1]??'','base64url').toString()).sub;}catch{throw new RummyError('Invalid test identity.',401);}if(!ids.includes(id))throw new RummyError('Unknown test identity.',401);return{principal:`member:${id}`,jokers:false};}});
app.server.listen(8812,'127.0.0.1',()=>console.log('Isolated real Carrom API on 8812'));
process.on('SIGTERM',async()=>{app.closeStreams();await app.rewards.stop();app.server.close(()=>{store.close();process.exit(0);});});
