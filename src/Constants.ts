import { Address } from '@ton/core'

export const treasuryAddresses = new Map<string, Address>([
    ['mainnet', Address.parse('EQCLyZHP4Xe8fpchQz76O-_RmUhaVc_9BAoGyJrwJrcbz2eZ')],
    ['testnet', Address.parse('kQAlDMBKCT8WJ4nwdwNRp0lvKMP4vUnHYspFPhEnyR36cg44')],
])

export const opDepositCoins = 0x3d3761a6
export const opUnstakeTokens = 0x595f07bc

// Thrown by the treasury when a deposit is too small to mint at least one
// token nano-unit at the current exchange rate. See minimumDepositAmount in Helpers.
export const errDepositTooSmall = 110

// Recommended gas prepayments. They are intentionally above the current dynamic
// fees returned by Treasury.getTreasuryFees — the unused remainder is returned
// as gas excess, so overpaying here only adds a safety margin against gas-price
// rises. Use getTreasuryFees for the exact current values.
export const feeStake = 100000000n
export const feeUnstake = 100000000n

export const minimumTonBalanceReserve = 200000000n
