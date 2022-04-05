import { BigNumber, ethers, FixedNumber } from 'ethers';

import { AbacusCore } from '..';
import { convertDecimalValue, mulBigAndFixed } from './utils';
import { DefaultTokenPriceGetter, TokenPriceGetter } from './token-prices';

/**
 * A note on arithmetic:
 * The ethers.BigNumber implementation behaves very similar to Solidity's
 * number handling by not supporting decimals. To avoid adding another big
 * number implementation as a dependency, we use ethers.FixedNumber, a
 * fixed point implementation intended to model how Solidity's half-supported
 * fixed point numbers work, see https://docs.soliditylang.org/en/v0.8.13/types.html#fixed-point-numbers).
 *
 * Generally, ceiling is used rather than floor here to err on the side of over-
 * estimating amounts.
 */

// If a domain doesn't specify how many decimals their native token has, 18 is used.
const DEFAULT_TOKEN_DECIMALS = 18;

export interface InterchainGasCalculatorConfig {
  /**
   * A multiplier applied to the estimated origin token payment amount.
   * @defaultValue 1.1
   */
  paymentEstimateMultiplier?: string;
  /**
   * A multiplier applied to the suggested destination gas price.
   * @defaultValue 1.1
   */
  suggestedGasPriceMultiplier?: string;
  /**
   * Used to get the native token prices of the origin and destination chains.
   * @defaultValue An instance of DefaultTokenPriceGetter.
   */
  tokenPriceGetter?: TokenPriceGetter;
}

/**
 * An undispatched Abacus message that will pay destination gas costs.
 */
export class InterchainGasCalculator {
  core: AbacusCore;

  tokenPriceGetter: TokenPriceGetter;

  paymentEstimateMultiplier: ethers.FixedNumber;
  suggestedGasPriceMultiplier: ethers.FixedNumber;

  constructor(core: AbacusCore, config?: InterchainGasCalculatorConfig) {
    this.core = core;

    this.tokenPriceGetter =
      config?.tokenPriceGetter ?? new DefaultTokenPriceGetter();

    this.paymentEstimateMultiplier = FixedNumber.from(
      config?.paymentEstimateMultiplier ?? '1.1',
    );
    this.suggestedGasPriceMultiplier = FixedNumber.from(
      config?.suggestedGasPriceMultiplier ?? '1.1',
    );
  }

  /**
   * Calculates the estimated payment for an amount of gas on the destination chain,
   * denominated in the native token of the origin chain. Considers the exchange
   * rate between the native tokens of the origin and destination chains, and the
   * suggested gas price on the destination chain. Applies the multiplier
   * `paymentEstimateMultiplier`.
   * @param originDomain The domain of the origin chain.
   * @param destinationDomain The domain of the destination chain.
   * @param destinationGas The amount of gas to pay for on the destination chain.
   * @returns An estimated amount of origin chain tokens (in wei) to cover
   * gas costs of the message on the destination chain.
   */
  async estimateGasPayment(
    originDomain: number,
    destinationDomain: number,
    destinationGas: BigNumber,
  ): Promise<BigNumber> {
    const destinationGasPrice = await this.suggestedGasPrice(
      destinationDomain,
    );
    const destinationCostWei = destinationGas.mul(destinationGasPrice);

    // Convert from destination domain native tokens to origin domain native tokens.
    const originCostWei = await this.convertDomainNativeTokens(
      destinationDomain,
      originDomain,
      destinationCostWei,
    );

    // Applies a multiplier
    return mulBigAndFixed(
      originCostWei,
      this.paymentEstimateMultiplier,
      true, // ceil
    );
  }

  /**
   * Using the exchange rates provided by tokenPriceGetter, returns the amount of
   * `toDomain` native tokens equivalent in value to the provided `fromAmount` of
   * `fromDomain` native tokens. Accounts for differences in the decimals of the tokens.
   * @param fromDomain The domain whose native token is being converted from.
   * @param toDomain The domain whose native token is being converted into.
   * @param fromAmount The amount of `fromDomain` native tokens to convert from.
   * @returns The amount of `toDomain` native tokens whose value is equivalent to
   * `fromAmount` of `fromDomain` native tokens.
   */
  async convertDomainNativeTokens(
    fromDomain: number,
    toDomain: number,
    fromAmount: BigNumber,
  ): Promise<BigNumber> {
    // A FixedNumber that doesn't care what the decimals of the from/to
    // tokens are -- it is just the amount of whole from tokens that a single
    // whole to token is equivalent in value to.
    const exchangeRate = await this.getExchangeRate(
      toDomain,
      fromDomain,
    );

    // Apply the exchange rate to the amount. This does not yet account for differences in
    // decimals between the two tokens.
    const exchangeRateProduct = mulBigAndFixed(
      fromAmount,
      exchangeRate,
      true, // ceil
    );

    // Converts exchangeRateProduct to having the correct number of decimals.
    return convertDecimalValue(
      exchangeRateProduct,
      this.nativeTokenDecimals(fromDomain),
      this.nativeTokenDecimals(toDomain),
    );
  }

  /**
   * @param baseDomain The domain whose native token is the base asset.
   * @param quoteDomain The domain whose native token is the quote asset.
   * @returns The exchange rate of the native tokens of the baseDomain and the quoteDomain.
   * I.e. the number of whole quote tokens a single whole base token is equivalent
   * in value to.
   */
   async getExchangeRate(
    baseDomain: number,
    quoteDomain: number,
  ): Promise<FixedNumber> {
    const baseUsd = await this.tokenPriceGetter.getNativeTokenUsdPrice(
      baseDomain,
    );
    const quoteUsd = await this.tokenPriceGetter.getNativeTokenUsdPrice(
      quoteDomain,
    );

    return quoteUsd.divUnsafe(baseUsd);
  }

  /**
   * Gets a suggested gas price for the destination chain, applying the multiplier
   * `destinationGasPriceMultiplier`.
   * @param destinationDomain The domain of the destination chain.
   * @returns The suggested gas price in wei on the destination chain.
   */
  async suggestedGasPrice(
    domain: number,
  ): Promise<BigNumber> {
    const provider = this.core.mustGetProvider(domain);
    const suggestedGasPrice = await provider.getGasPrice();

    // suggestedGasPrice * destinationGasPriceMultiplier
    return mulBigAndFixed(
      suggestedGasPrice,
      this.suggestedGasPriceMultiplier,
      true, // ceil
    );
  }

  /**
   * Gets the number of decimals of the provided domain's native token.
   * @param domain The domain.
   * @returns The number of decimals of `domain`'s native token.
   */
  nativeTokenDecimals(domain: number) {
    return (
      this.core.getDomain(domain)?.nativeTokenDecimals ?? DEFAULT_TOKEN_DECIMALS
    );
  }
}
