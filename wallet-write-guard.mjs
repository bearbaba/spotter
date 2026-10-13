/**
 * Serialize wallet write preparation across Spotter tabs on the same HTTPS origin.
 * No localStorage lease: a browser-managed Web Lock is released if a tab closes.
 */
export async function withExclusiveWriteLock(lockManager, scope, action) {
  if(!lockManager || typeof lockManager.request!=="function")
    throw Error("Safe multi-tab signing is unavailable in this browser. Use an up-to-date browser supporting Web Locks.");
  if(typeof scope!=="string" || !/^\d+:0x[0-9a-fA-F]{40}$/.test(scope))
    throw Error("Invalid contract lock scope.");
  if(typeof action!=="function")throw Error("Invalid signing action.");
  return lockManager.request("spotter:write:"+scope.toLowerCase(),{mode:"exclusive",ifAvailable:true},async lock=>{
    if(!lock)throw Error("A wallet transaction is already being prepared in another Spotter tab. No second signature requested.");
    return action();
  });
}
