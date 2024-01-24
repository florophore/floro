import os, { NetworkInterfaceInfo } from 'os';
import ip from 'ip';

const getNetWorkInterface = (): NetworkInterfaceInfo => {
  try {
    const ifaces = os.networkInterfaces();
    return ifaces['en0']?.find(iface => iface.address == ip.address()) ?? null;
  } catch(e) {
    return null;
  }
}

function ipNumber(address: string) {
  const ip = address.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if(ip) {
      return (+ip[1]<<24) + (+ip[2]<<16) + (+ip[3]<<8) + (+ip[4]);
  }
  return null;
}

export const ipInSameSubnet = (remoteIp: string) => {
  try {
    const networkInterface = getNetWorkInterface();
    if (!networkInterface) {
      return false;
    }
    const subnet = ip.cidrSubnet(networkInterface.cidr)
    if (!subnet) {
      return false;
    }
    const currIp = ip.address();
    return (ipNumber(currIp) & ipNumber(subnet.subnetMask)) == (ipNumber(remoteIp) & ipNumber(subnet.subnetMask));
  } catch(e) {
    return false;
  }
}