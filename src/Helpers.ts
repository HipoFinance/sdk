import { Address, beginCell } from '@ton/ton'
import { feeStake, feeUnstake, minimumTonBalanceReserve, opDepositCoins, opUnstakeTokens } from './Constants'

type UnstakeMode = 'auto' | 'instant' | 'best'

export function maxAmountToStake(tonBalance: bigint): bigint {
    tonBalance -= minimumTonBalanceReserve
    return tonBalance > 0n ? tonBalance : 0n
}

interface TonConnectMessage {
    address: string
    amount: string
    stateInit: string | undefined
    payload: string | undefined
}

export function createDepositMessage(
    treasury: Address,
    amountInNano: bigint,
    queryId = 0n,
    referrer?: Address,
): TonConnectMessage {
    const address = treasury.toString()
    const amount = (amountInNano + feeStake).toString()
    const stateInit = undefined
    const payload = beginCell()
        .storeUint(opDepositCoins, 32)
        .storeUint(queryId, 64)
        .storeAddress(null)
        .storeCoins(amountInNano)
        .storeCoins(1n)
        .storeAddress(referrer)
        .endCell()
        .toBoc()
        .toString('base64')
    return {
        address,
        amount,
        stateInit,
        payload,
    }
}

export function createUnstakeMessage(
    wallet: Address,
    amountInNano: bigint,
    unstakeMode: UnstakeMode = 'auto',
    queryId = 0n,
): TonConnectMessage {
    const address = wallet.toString()
    const amount = feeUnstake.toString()
    const stateInit = undefined
    const payload = beginCell()
        .storeUint(opUnstakeTokens, 32)
        .storeUint(queryId, 64)
        .storeCoins(amountInNano)
        .storeAddress(undefined)
        .storeMaybeRef(beginCell().storeUint(fromUnstakeMode(unstakeMode), 4).storeCoins(1n))
        .endCell()
        .toBoc()
        .toString('base64')
    return {
        address,
        amount,
        stateInit,
        payload,
    }
}

function fromUnstakeMode(unstakeMode: UnstakeMode): number {
    switch (unstakeMode) {
        case 'auto':
            return 0
        case 'instant':
            return 1
        case 'best':
            return 2
    }
}
