import { randomBytes } from "crypto";

class BinarySession {
  public static instance: BinarySession;
  public token: string;

  constructor() {
    if (!this.token) {
      this.token = randomBytes(64).toString("hex");
    }
  }

  static make() {
    if (this.instance) {
      return this.instance;
    }
    this.instance = new BinarySession();
    return this.instance;
  }
}

export default BinarySession.make();
