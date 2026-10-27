import 'dotenv/config';
import { createApp } from './app.mjs';
const app=createApp({dbPath:process.env.DATABASE_PATH||undefined});
const port=Number(process.env.API_PORT||process.env.PORT||3001),host=process.env.HOST||'127.0.0.1';
const server=app.listen(port,host,()=>{
  console.log(`Joare Studio iniciado em http://${host}:${port}`);
  app.locals.syncDaily();
});
const daily=setInterval(()=>app.locals.syncDaily(),60*60*1000);daily.unref();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(daily);server.close(()=>{app.locals.db.close();process.exit(0);});});
