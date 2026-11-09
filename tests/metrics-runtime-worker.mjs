// Test-only entry point. Uses the real Workers fetch API with a local mock upstream.
import {cloudflareUsage} from '../lib/data-metrics.mjs';
export default {async fetch(){
 try{return Response.json({ok:true,usage:await cloudflareUsage('a'.repeat(32),'test-only-metrics-token')})}
 catch(error){return Response.json({ok:false,error:error.message},{status:error.status||500})}
}};
