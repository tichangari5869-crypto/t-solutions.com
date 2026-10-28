// Usage: node hash-password.js "your long password"  -> prints ADMIN_PASS_HASH for your .env
const c=require("crypto"),p=process.argv[2];if(!p||p.length<12){console.error("Use a password of 12 or more characters.");process.exit(1)}
const s=c.randomBytes(16);console.log("ADMIN_PASS_HASH="+s.toString("hex")+":"+c.scryptSync(p,s,64).toString("hex"));
