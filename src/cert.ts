import forge from "node-forge";
//@ts-ignore
forge.options.usePureJavaScript = true;
import crypto from "node:crypto";
import { DataSource } from "./datasource";
import ip from 'ip';

const pki = forge.pki;

const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;
const TWENTY_SIX_WEEKS = ONE_WEEK * 26;

export interface Cert {
  ca: {
    key: string;
    cert: string;
  };
  fingerprint: string;
}

export interface TLSCert {
  certfile: Cert;
  ipAddr: string;
  createdAt: string;
}

async function genCACert(ip: string): Promise<Cert> {
  const options = {
    commonName: "Floro Local Cert",
    bits: 2048,
  };

  let keyPair: { publicKey: forge.pki.PublicKey; privateKey: forge.pki.PrivateKey } = await new Promise(
    (res, rej) => {
      pki.rsa.generateKeyPair({ bits: options.bits }, (error, pair) => {
        if (error) rej(error);
        else res(pair);
      });
    }
  );

  let cert = pki.createCertificate();
  cert.publicKey = keyPair.publicKey;
  cert.serialNumber = crypto.randomUUID().replace(/-/g, "");

  cert.validity.notBefore = new Date();
  cert.validity.notBefore.setDate(cert.validity.notBefore.getDate() - 1);
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  cert.setSubject([{ name: "commonName", value: options.commonName }]);
  cert.setExtensions([
    { name: "basicConstraints", cA: true },
    {
		name: 'subjectAltName',
		altNames: [
            ({type: 7, ip})
		]
	}
]);

  cert.setIssuer(cert.subject.attributes);
  cert.sign(keyPair.privateKey, forge.md.sha256.create());

  return {
    ca: {
      key: pki.privateKeyToPem(keyPair.privateKey),
      cert: pki.certificateToPem(cert),
    },
    fingerprint: forge.util.encode64(
      pki.getPublicKeyFingerprint(keyPair.publicKey, {
        type: "SubjectPublicKeyInfo",
        md: forge.md.sha256.create(),
        encoding: "binary",
      })
    ),
  };
}

export class LocalCertHandler {
  private static cert: Cert;

  public static watchIp(callback: (ipAddr: string) => Promise<void>) {
    let currentIp = ip.address();

    setInterval(() => {
        const ipAddr = ip.address();
        if (ipAddr != currentIp) {
            currentIp = ipAddr;
            callback(ipAddr)
        }
    }, 1_000);
  }

  public static async onStartTLSCert(dataSource: DataSource, ipAddr: string): Promise<boolean> {
    try {
      const diskCertfile = await dataSource.readTLSCert(ipAddr);
      if (!diskCertfile) {
        this.cert = await genCACert(ipAddr);
        const tlsCert: TLSCert = {
          createdAt: new Date().toISOString(),
          ipAddr,
          certfile: this.cert,
        };
        await dataSource.writeTLSCert(ipAddr, tlsCert);
        return true;
      }
      const createdAt = new Date(diskCertfile.createdAt);
      const createdAtMS = createdAt.getTime();
      const nowMS = new Date().getTime();
      const delta = nowMS - createdAtMS;
      if (delta > TWENTY_SIX_WEEKS) {
        this.cert = await genCACert(ipAddr);
        const tlsCert: TLSCert = {
          createdAt: new Date().toISOString(),
          ipAddr,
          certfile: this.cert,
        };
        await dataSource.writeTLSCert(ipAddr, tlsCert);
        return true;
      }
      if (diskCertfile.ipAddr != ipAddr) {
        this.cert = await genCACert(ipAddr);
        const tlsCert: TLSCert = {
          createdAt: new Date().toISOString(),
          ipAddr,
          certfile: this.cert,
        };
        await dataSource.writeTLSCert(ipAddr, tlsCert);
        return true;
      }
      this.cert = diskCertfile.certfile;
      return true;
    } catch (e) {
      return false;
    }
  }

  public static async getCert(): Promise<Cert> {
    return this.cert;
  }
}
