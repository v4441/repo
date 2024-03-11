import { BigNumber } from 'ethers';

enum ProofStatus {
  running = 'running',
  success = 'success',
  error = 'error',
}

export const genesisTime = 1606824023;
export const slotsPerSecond = 12;

class LightClientService {
  proofStatus: ProofStatus = ProofStatus.running;
  async calculateSlot(timestamp: BigNumber): Promise<BigNumber> {
    return timestamp
      .sub(BigNumber.from(genesisTime))
      .div(BigNumber.from(slotsPerSecond));
  }

  async requestProof(
    syncCommitteePoseidon: string,
    slot: BigNumber,
  ): Promise<string> {
    return 'pendingProofId12';
  }

  async getSyncCommitteePoseidons(slot: BigNumber): Promise<string> {
    return '0x00ccb5d015f534ff595c2a31c425afcccfff08107c7f7a581cc1d4f27c307aa2';
  }

  async getProofStatus(pendingProofId: string): Promise<ProofStatus> {
    return ProofStatus.success;
  }
}

export { LightClientService };
