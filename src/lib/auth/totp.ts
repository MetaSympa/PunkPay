import { TOTP } from 'otpauth';

export class TOTPAuth {
  static generate(): { secret: string; uri: string } {
    const totp = new TOTP({
      issuer: 'PunkPay',
      label: 'PunkPay',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });
    return {
      secret: totp.secret.base32,
      uri: totp.toString(),
    };
  }

  static verify(secret: string, token: string): boolean {
    const totp = new TOTP({
      issuer: 'PunkPay',
      label: 'PunkPay',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });
    const delta = totp.validate({ token, window: 1 });
    return delta !== null;
  }
}
