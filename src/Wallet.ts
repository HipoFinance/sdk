import { Address, beginCell, Cell, Contract, ContractProvider, Dictionary, Sender, SendMode } from '@ton/ton'
import { opUnstakeTokens } from './Constants'

export enum UnstakeMode {
    Auto, // 0
    Instant, // 1
    Best, // 2
}

export interface WalletState {
    tokens: bigint
    staking: Dictionary<bigint, bigint>
    unstaking: bigint
}

export class Wallet implements Contract {
    constructor(readonly address: Address) {}

    static createFromAddress(address: Address) {
        return new Wallet(address)
    }

    async getWalletState(provider: ContractProvider): Promise<WalletState> {
        const { stack } = await provider.get('get_wallet_state', [])
        return {
            tokens: stack.readBigNumber(),
            staking: Dictionary.loadDirect(
                Dictionary.Keys.BigUint(32),
                Dictionary.Values.BigVarUint(4),
                stack.readCellOpt(),
            ),
            unstaking: stack.readBigNumber(),
        }
    }

    async sendUnstakeTokens(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint | string
            bounce?: boolean
            sendMode?: SendMode
            queryId?: bigint
            tokens: bigint
            returnExcess?: Address
            mode?: UnstakeMode
            ownershipAssignedAmount?: bigint
        },
    ) {
        let customPayload: Cell | null = null
        if (opts.ownershipAssignedAmount != null || opts.mode != null) {
            customPayload = beginCell()
                .storeUint(opts.mode ?? 0, 4)
                .storeCoins(opts.ownershipAssignedAmount ?? 0)
                .endCell()
        }
        await provider.internal(via, {
            value: opts.value,
            bounce: opts.bounce,
            sendMode: opts.sendMode,
            body: beginCell()
                .storeUint(opUnstakeTokens, 32)
                .storeUint(opts.queryId ?? 0, 64)
                .storeCoins(opts.tokens)
                .storeAddress(opts.returnExcess)
                .storeMaybeRef(customPayload)
                .endCell(),
        })
    }
}
