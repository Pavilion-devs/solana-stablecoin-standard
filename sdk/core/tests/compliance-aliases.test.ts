import { expect } from 'chai';
import { PublicKey } from '@solana/web3.js';
import { Compliance } from '../src/compliance';
import { Preset, Presets } from '../src/constants';

describe('SDK compatibility aliases', () => {
  it('exposes Presets as an alias of Preset', () => {
    expect(Presets.SSS_1).to.equal(Preset.SSS_1);
    expect(Presets.SSS_2).to.equal(Preset.SSS_2);
    expect(Presets.CUSTOM).to.equal(Preset.CUSTOM);
  });

  it('blacklistAdd delegates to addToBlacklist', async () => {
    const compliance = Object.create(Compliance.prototype) as Compliance & {
      addToBlacklist: (address: PublicKey, reason: string) => Promise<string>;
    };
    compliance.addToBlacklist = async (address: PublicKey, reason: string) =>
      `${address.toBase58()}:${reason}`;

    const address = new PublicKey('11111111111111111111111111111111');
    const result = await compliance.blacklistAdd(address, 'test');

    expect(result).to.equal(`${address.toBase58()}:test`);
  });

  it('blacklistRemove delegates to removeFromBlacklist', async () => {
    const compliance = Object.create(Compliance.prototype) as Compliance & {
      removeFromBlacklist: (address: PublicKey) => Promise<string>;
    };
    compliance.removeFromBlacklist = async (address: PublicKey) => address.toBase58();

    const address = new PublicKey('11111111111111111111111111111111');
    const result = await compliance.blacklistRemove(address);

    expect(result).to.equal(address.toBase58());
  });
});
