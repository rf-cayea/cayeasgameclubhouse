import {BackgammonRoomStore} from '../../server/backgammon-rooms';
import {BG_BOARDS} from '../../src/lib/backgammon-sets';
/** Isolated browser QA only: loopback HTTP, fictional member, in-memory database. */
import {verifiedCrateWin} from './reward-crate-fixture';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {TestD1} from './d1';
import {EconomyStore} from '../../server/economy';
import {ECONOMY_CATALOG} from '../../src/lib/economy-protocol';
const db=new TestD1(),actor={principal:'member:11111111-1111-4111-8111-111111111111'},store=new EconomyStore(db,Date.now,()=>0);
await store.ensureMember(actor,{wallet:{owned:BG_BOARDS.slice(1).map(d=>d.id),equipped:{}},awards:[]});
for(const game of Array.from({length:27},(_,n)=>n%2?'farkle' as const:'five-dice' as const)){
 const match_id=randomUUID(),payload={version:1 as const,match_id,mode:'bot' as const,players:[{user_id:actor.principal.slice(7),bot:false,level:null},{user_id:null,bot:true,level:'normal' as const}],winner:0,scores:game==='farkle'?[10000,9000]:[200,100],completed_at:new Date().toISOString()};
 db.sqlite.prepare(`INSERT INTO ${game==='farkle'?'farkle':'five_dice'}_rewards(match_id,room_code,payload,created_at) VALUES(?,?,?,?)`).run(match_id,'A1B2C3D4',JSON.stringify(payload),Date.now());
 if(game==='farkle')await store.claimFarkleReward(payload);else await store.claimFiveDiceReward(payload);
}
for(let n=0;n<27;n++){await verifiedCrateWin(store,db.sqlite,'dominoes',actor.principal.slice(7));await verifiedCrateWin(store,db.sqlite,n%2?'spades':'rummy',actor.principal.slice(7));}
for(let n=0;n<54;n++){const match_id=randomUUID(),payload={version:1 as const,match_id,mode:'bot' as const,players:[{user_id:actor.principal.slice(7),bot:false,level:null},{user_id:null,bot:true,level:'normal' as const}],winner:0,target:1,scores:[1,0],completed_at:new Date().toISOString()};db.sqlite.prepare('INSERT INTO backgammon_rewards(match_id,room_code,payload,created_at) VALUES(?,?,?,?)').run(match_id,'A1B2C3D4',JSON.stringify(payload),Date.now());await store.claimBackgammonReward(payload);}
const backgammon=new BackgammonRoomStore(db);
const server=createServer(async(req,res)=>{try{
 if(!req.headers.authorization?.startsWith('Bearer ')){res.writeHead(401);res.end('{}');return;}
 const chunks:Buffer[]=[];for await(const c of req)chunks.push(c);
 if(req.url?.startsWith('/api/backgammon')){if(req.url.endsWith('/events')){res.writeHead(503);res.end('{}');return;}const match=/room\/([A-F0-9]{8})/.exec(req.url);const identity={...actor,jokers:false,owned:(await store.wallet(actor)).owned};const view=req.method==='POST'?await backgammon.command(identity,JSON.parse(Buffer.concat(chunks).toString())):match?await backgammon.get(match[1]!,actor.principal):{member:true};res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(view));return;}
 const data=req.url==='/api/economy/catalog'?{items:ECONOMY_CATALOG}:req.method==='POST'?await store.command(actor,JSON.parse(Buffer.concat(chunks).toString())):await store.read(actor);
 res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));
}catch(error){res.writeHead((error as {status?:number}).status??500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:(error as Error).message}));}});
server.listen(8812,'127.0.0.1',()=>console.log('Isolated crate QA API ready on 8812'));
process.on('SIGTERM',()=>server.close(()=>{db.sqlite.close();process.exit(0);}));
