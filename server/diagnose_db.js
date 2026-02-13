const dns = require('dns');
const uri = process.env.MONGO_URI || "mongodb+srv://gboyegaibk:Oyinlola%40007@cluster0.ckokr6u.mongodb.net/?appName=Cluster0";

// Extract hostname
try {
    const hostPart = uri.split('@')[1].split('/')[0];
    const srvHostname = `_mongodb._tcp.${hostPart}`;

    console.log(`Attempting to resolve SRV record for: ${srvHostname}`);

    dns.resolveSrv(srvHostname, (err, addresses) => {
        if (err) {
            console.error("DNS Resolution Failed:", err.code);
            console.log("SUGGESTION: Your network might be blocking DNS SRV lookups (Google/Cloudflare DNS usually works).");
            console.log("You can try using the Standard Connection String instead of SRV.");
        } else {
            console.log("DNS Resolution Successful!");
            console.log("Found Shards:", addresses);
            
            // Construct standard URI
            const shards = addresses.map(a => `${a.name}:${a.port}`).join(',');
            const authPart = uri.split('://')[1].split('@')[0];
            const queryPart = uri.split('?')[1] || 'ssl=true&replicaSet=atlas-unknown-shard-0&authSource=admin&retryWrites=true&w=majority';
            
            const newUri = `mongodb://${authPart}@${shards}/?${queryPart}`;
            console.log("\n--- GENERATED STANDARD URI ---");
            console.log(newUri);
            console.log("------------------------------");
        }
    });
} catch (e) {
    console.error("URI Parse Error", e);
}
