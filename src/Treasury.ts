import {
    Address,
    beginCell,
    Builder,
    Cell,
    Contract,
    ContractProvider,
    Dictionary,
    DictionaryValue,
    Slice,
    TupleBuilder,
} from '@ton/core'

export interface Times {
    currentRoundSince: bigint
    participateSince: bigint
    participateUntil: bigint
    nextRoundSince: bigint
    nextRoundUntil: bigint
    stakeHeldFor: bigint
}

export enum ParticipationState {
    Open,
    Distributing,
    Staked,
    Validating,
    Held,
    Recovering,
    // settled and booked its reward, but still holds its bills while an older round can still
    // book a reward, so deferred deposits cannot mint at a rate that excludes that reward
    ReadyToBurn,
    Burning,
}

export interface Request {
    minPayment: bigint
    borrowerRewardShare: bigint
    loanAmount: bigint
    accrueAmount: bigint
    stakeAmount: bigint
    newStakeMsg: Cell
}

export interface Participation {
    state?: ParticipationState
    size?: bigint
    sorted?: Dictionary<bigint, Dictionary<bigint, unknown>>
    requests?: Dictionary<bigint, Request>
    rejected?: Dictionary<bigint, Request>
    accepted?: Dictionary<bigint, Request>
    accrued?: Dictionary<bigint, Request>
    staked?: Dictionary<bigint, Request>
    recovering?: Dictionary<bigint, Request>
    totalStaked?: bigint
    totalRecovered?: bigint
    currentVsetHash?: bigint
    stakeHeldFor?: bigint
    stakeHeldUntil?: bigint
}

export interface TreasuryFees {
    requestLoanFee: bigint
    depositCoinsFee: bigint
    unstakeAllTokensFee: bigint
}

export interface TreasuryConfig {
    totalCoins: bigint
    totalTokens: bigint
    totalStaking: bigint
    totalUnstaking: bigint
    totalBorrowersStake: bigint
    parent: Address | null
    participations: Dictionary<bigint, Participation>
    roundsImbalance: bigint
    stopped: boolean
    instantMint: boolean
    loanCodes: Dictionary<bigint, Cell>
    previousRate: bigint
    currentRate: bigint
    halter: Address
    governor: Address
    proposedGovernor: Cell | null
    governanceFee: bigint
    collectionCodes: Dictionary<bigint, Cell>
    billCodes: Dictionary<bigint, Cell>
    oldParents: Dictionary<bigint, unknown>
}

export const emptyDictionaryValue: DictionaryValue<unknown> = {
    serialize: function () {
        return
    },
    parse: function (): unknown {
        return {}
    },
}

export const sortedDictionaryValue: DictionaryValue<Dictionary<bigint, unknown>> = {
    serialize: function (src: Dictionary<bigint, unknown>, builder: Builder) {
        builder.storeRef(beginCell().storeDictDirect(src))
    },
    parse: function (src: Slice): Dictionary<bigint, unknown> {
        return src.loadRef().beginParse().loadDictDirect(Dictionary.Keys.BigUint(256), emptyDictionaryValue)
    },
}

export const requestDictionaryValue: DictionaryValue<Request> = {
    serialize: function (src: Request, builder: Builder) {
        builder
            .storeCoins(src.minPayment)
            .storeUint(src.borrowerRewardShare, 8)
            .storeCoins(src.loanAmount)
            .storeCoins(src.accrueAmount)
            .storeCoins(src.stakeAmount)
            .storeRef(src.newStakeMsg)
    },
    parse: function (src: Slice): Request {
        return {
            minPayment: src.loadCoins(),
            borrowerRewardShare: src.loadUintBig(8),
            loanAmount: src.loadCoins(),
            accrueAmount: src.loadCoins(),
            stakeAmount: src.loadCoins(),
            newStakeMsg: src.loadRef(),
        }
    },
}

export const participationDictionaryValue: DictionaryValue<Participation> = {
    serialize: function (src: Participation, builder: Builder) {
        builder
            .storeUint(src.state ?? 0, 4)
            .storeUint(src.size ?? 0, 16)
            .storeDict(src.sorted)
            .storeDict(src.requests)
            .storeDict(src.rejected)
            .storeDict(src.accepted)
            .storeDict(src.accrued)
            .storeDict(src.staked)
            .storeDict(src.recovering)
            .storeCoins(src.totalStaked ?? 0)
            .storeCoins(src.totalRecovered ?? 0)
            .storeUint(src.currentVsetHash ?? 0, 256)
            .storeUint(src.stakeHeldFor ?? 0, 32)
            .storeUint(src.stakeHeldUntil ?? 0, 32)
    },
    parse: function (src: Slice): Participation {
        return {
            state: src.loadUint(4),
            size: src.loadUintBig(16),
            sorted: src.loadDict(Dictionary.Keys.BigUint(112), sortedDictionaryValue),
            requests: src.loadDict(Dictionary.Keys.BigUint(256), requestDictionaryValue),
            rejected: src.loadDict(Dictionary.Keys.BigUint(256), requestDictionaryValue),
            accepted: src.loadDict(Dictionary.Keys.BigUint(256), requestDictionaryValue),
            accrued: src.loadDict(Dictionary.Keys.BigUint(256), requestDictionaryValue),
            staked: src.loadDict(Dictionary.Keys.BigUint(256), requestDictionaryValue),
            recovering: src.loadDict(Dictionary.Keys.BigUint(256), requestDictionaryValue),
            totalStaked: src.loadCoins(),
            totalRecovered: src.loadCoins(),
            currentVsetHash: src.loadUintBig(256),
            stakeHeldFor: src.loadUintBig(32),
            stakeHeldUntil: src.loadUintBig(32),
        }
    },
}

export class Treasury implements Contract {
    constructor(readonly address: Address) {}

    static createFromAddress(address: Address) {
        return new Treasury(address)
    }

    async getTimes(provider: ContractProvider): Promise<Times> {
        const { stack } = await provider.get('get_times', [])
        return {
            currentRoundSince: stack.readBigNumber(),
            participateSince: stack.readBigNumber(),
            participateUntil: stack.readBigNumber(),
            nextRoundSince: stack.readBigNumber(),
            nextRoundUntil: stack.readBigNumber(),
            stakeHeldFor: stack.readBigNumber(),
        }
    }

    async getTreasuryState(provider: ContractProvider): Promise<TreasuryConfig> {
        const { stack } = await provider.get('get_treasury_state', [])
        return {
            totalCoins: stack.readBigNumber(),
            totalTokens: stack.readBigNumber(),
            totalStaking: stack.readBigNumber(),
            totalUnstaking: stack.readBigNumber(),
            totalBorrowersStake: stack.readBigNumber(),
            parent: stack.readAddressOpt(),
            participations: Dictionary.loadDirect(
                Dictionary.Keys.BigUint(32),
                participationDictionaryValue,
                stack.readCellOpt(),
            ),
            roundsImbalance: stack.readBigNumber(),
            stopped: stack.readBoolean(),
            instantMint: stack.readBoolean(),
            loanCodes: Dictionary.loadDirect(Dictionary.Keys.BigUint(32), Dictionary.Values.Cell(), stack.readCell()),
            previousRate: stack.readBigNumber(),
            currentRate: stack.readBigNumber(),
            halter: stack.readAddress(),
            governor: stack.readAddress(),
            proposedGovernor: stack.readCellOpt(),
            governanceFee: stack.readBigNumber(),
            collectionCodes: Dictionary.loadDirect(
                Dictionary.Keys.BigUint(32),
                Dictionary.Values.Cell(),
                stack.readCell(),
            ),
            billCodes: Dictionary.loadDirect(Dictionary.Keys.BigUint(32), Dictionary.Values.Cell(), stack.readCell()),
            oldParents: Dictionary.loadDirect(Dictionary.Keys.BigUint(256), emptyDictionaryValue, stack.readCellOpt()),
        }
    }

    async getMaxBurnableTokens(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get('get_max_burnable_tokens', [])
        return stack.readBigNumber()
    }

    async getParticipation(provider: ContractProvider, roundSince: bigint): Promise<Participation> {
        const tb = new TupleBuilder()
        tb.writeNumber(roundSince)
        const { stack } = await provider.get('get_participation', tb.build())
        return {
            state: stack.readNumber(),
            size: stack.readBigNumber(),
            sorted: Dictionary.loadDirect(Dictionary.Keys.BigUint(112), sortedDictionaryValue, stack.readCellOpt()),
            requests: Dictionary.loadDirect(Dictionary.Keys.BigUint(256), requestDictionaryValue, stack.readCellOpt()),
            rejected: Dictionary.loadDirect(Dictionary.Keys.BigUint(256), requestDictionaryValue, stack.readCellOpt()),
            accepted: Dictionary.loadDirect(Dictionary.Keys.BigUint(256), requestDictionaryValue, stack.readCellOpt()),
            accrued: Dictionary.loadDirect(Dictionary.Keys.BigUint(256), requestDictionaryValue, stack.readCellOpt()),
            staked: Dictionary.loadDirect(Dictionary.Keys.BigUint(256), requestDictionaryValue, stack.readCellOpt()),
            recovering: Dictionary.loadDirect(
                Dictionary.Keys.BigUint(256),
                requestDictionaryValue,
                stack.readCellOpt(),
            ),
            totalStaked: stack.readBigNumber(),
            totalRecovered: stack.readBigNumber(),
            currentVsetHash: stack.readBigNumber(),
            stakeHeldFor: stack.readBigNumber(),
            stakeHeldUntil: stack.readBigNumber(),
        }
    }

    async getCollectionAddress(provider: ContractProvider, roundSince: bigint): Promise<Address> {
        const tb = new TupleBuilder()
        tb.writeNumber(roundSince)
        const { stack } = await provider.get('get_collection_address', tb.build())
        return stack.readAddress()
    }

    async getBillAddress(provider: ContractProvider, roundSince: bigint, index: bigint): Promise<Address> {
        const tb = new TupleBuilder()
        tb.writeNumber(roundSince)
        tb.writeNumber(index)
        const { stack } = await provider.get('get_bill_address', tb.build())
        return stack.readAddress()
    }

    async getLoanAddress(provider: ContractProvider, borrower: Address, roundSince: bigint): Promise<Address> {
        const tb = new TupleBuilder()
        tb.writeAddress(borrower)
        tb.writeNumber(roundSince)
        const { stack } = await provider.get('get_loan_address', tb.build())
        return stack.readAddress()
    }

    async getTreasuryFees(provider: ContractProvider, ownershipAssignedAmount: bigint): Promise<TreasuryFees> {
        const tb = new TupleBuilder()
        tb.writeNumber(ownershipAssignedAmount)
        const { stack } = await provider.get('get_treasury_fees', tb.build())
        return {
            requestLoanFee: stack.readBigNumber(),
            depositCoinsFee: stack.readBigNumber(),
            unstakeAllTokensFee: stack.readBigNumber(),
        }
    }

    async getSurplus(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get('get_surplus', [])
        return stack.readBigNumber()
    }

    async getMaxPunishment(provider: ContractProvider, stake: bigint): Promise<bigint> {
        const tb = new TupleBuilder()
        tb.writeNumber(stake)
        const { stack } = await provider.get('get_max_punishment', tb.build())
        return stack.readBigNumber()
    }
}
