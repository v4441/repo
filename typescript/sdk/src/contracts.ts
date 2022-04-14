import { Connection } from './types';

/**
 * Abstract class for managing collections of contracts
 */
export class AbacusAppContracts<T> {
  public readonly addresses: T;
  private _connection?: Connection;

  constructor(addresses: T) {
    this.addresses = addresses;
  }

  connect(connection: Connection) {
    this._connection = connection;
  }

  get connection(): Connection {
    if (!this._connection) {
      throw new Error('No provider or signer. Call `connect` first.');
    }
    return this._connection;
  }
}
