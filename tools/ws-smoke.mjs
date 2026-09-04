/** Quick WS smoke test: create room + join. */
import WebSocket from 'ws';

const url = process.env.WS_URL || 'ws://127.0.0.1:3000';

function once(ws) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), 5000);
    ws.once('message', (d) => {
      clearTimeout(t);
      resolve(JSON.parse(String(d)));
    });
  });
}

function send(ws, obj) {
  ws.send(JSON.stringify(obj));
}

const a = new WebSocket(url);
await new Promise((r) => a.once('open', r));
send(a, { type: 'hello', playerId: 'test_a' });
console.log('A', await once(a));
send(a, { type: 'createRoom', nickname: 'Alice', gameType: 'briscola', playerCount: 2 });
const created = await once(a);
console.log('created', created.room?.code, created.you);

const b = new WebSocket(url);
await new Promise((r) => b.once('open', r));
send(b, { type: 'hello', playerId: 'test_b' });
await once(b);
send(b, { type: 'joinRoom', nickname: 'Bob', code: created.room.code });
const joined = await once(b);
console.log('joined seats', joined.room?.seats?.map((s) => s.nickname));

send(a, { type: 'startGame' });
const started = await once(a);
console.log('started', started.type, started.state?.phase, 'hand', started.state?.hands?.[0]?.length);

a.close();
b.close();
console.log('OK');
process.exit(0);
