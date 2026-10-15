// GenLayer Studionet wallet networking, separate from any contract write.
// Official network: https://docs.genlayer.com/developers/networks
export const STUDIONET_CHAIN_ID=61999;
export const STUDIONET_CHAIN_HEX="0xf22f";
export const STUDIONET_NETWORK={
  chainId:STUDIONET_CHAIN_HEX,
  chainName:"GenLayer Studionet",
  nativeCurrency:{name:"GEN",symbol:"GEN",decimals:18},
  rpcUrls:["https://studio.genlayer.com/api"],
  blockExplorerUrls:["https://explorer-studio.genlayer.com"]
};

export function isStudionetChainId(value){
  return typeof value==="string" && /^0x[0-9a-f]+$/i.test(value) && Number.parseInt(value,16)===STUDIONET_CHAIN_ID;
}

function unknownChain(error){
  return error?.code===4902 || error?.data?.originalError?.code===4902 ||
    error?.data?.code===4902;
}

export async function requestStudionetSwitch(provider){
  if(!provider?.request)throw Error("MetaMask is required to switch the network.");
  if(isStudionetChainId(await provider.request({method:"eth_chainId"})))return "already_selected";
  try {
    await provider.request({method:"wallet_switchEthereumChain",params:[{chainId:STUDIONET_CHAIN_HEX}]});
  } catch(error){
    if(!unknownChain(error))throw error; // User rejection or other wallet error: fail closed.
    await provider.request({method:"wallet_addEthereumChain",params:[STUDIONET_NETWORK]});
    // Some wallets add but do not select the network.
    if(!isStudionetChainId(await provider.request({method:"eth_chainId"}))){
      await provider.request({method:"wallet_switchEthereumChain",params:[{chainId:STUDIONET_CHAIN_HEX}]});
    }
  }
  const actual=await provider.request({method:"eth_chainId"});
  if(!isStudionetChainId(actual))
    throw Error("MetaMask has not selected GenLayer Studionet (61999). No transaction was sent.");
  return "switched";
}
