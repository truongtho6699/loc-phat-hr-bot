import {createRelay} from './relay.mjs';
const port=Number(process.env.SERVER_PORT || process.env.PORT || 8080);
if(!Number.isInteger(port) || port<1 || port>65535) throw new Error('Invalid assigned HTTP port');
const server=createRelay({webhookSecret:process.env.BOT_WEBHOOK_SECRET,relaySecret:process.env.BOT_RELAY_SECRET,appsScriptUrl:process.env.APPS_SCRIPT_URL});
server.requestTimeout=30000;
server.headersTimeout=10000;
server.listen(port,'0.0.0.0',()=>console.log('Loc Phat HR webhook ready'));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
