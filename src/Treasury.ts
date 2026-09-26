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

/**
 * Round timing read live from the network config. For annualising the exchange rate, use
 * `TreasuryConfig.windowDuration` instead of deriving a round length from these. The published rate
 * window spans two settlement releases, so it is about two rounds and never one: dividing the year
 * by a round length taken from here would roughly SQUARE the APY.
 */
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
    /** Out of 65535. A bid made on the old 0-255 scale is exactly this value divided by 257. */
    borrowerRewardShare: bigint
    loanAmount: bigint
    accrueAmount: bigint
    stakeAmount: bigint
    /** borrowerFee snapshotted when the request was made, so a later change cannot reprice it. */
    requestFee: bigint
    /**
     * The borrower's cap on loan + accrue + collateral, 0n for none. Absent on a request stored before the
     * treasury's stake-cap release, which the treasury reads as uncapped.
     */
    maxStake?: bigint
    newStakeMsg: Cell
}

export interface LoanRequest {
    stage: ParticipationState
    minPayment: bigint
    /** Out of 65535. A bid made on the old 0-255 scale is exactly this value divided by 257. */
    borrowerRewardShare: bigint
    loanAmount: bigint
    accrueAmount: bigint
    stakeAmount: bigint
    /** Out of 65535. borrowerFee snapshotted when the request was made, so a later change cannot reprice it. */
    requestFee: bigint
    /** The borrower's cap on loan + accrue + collateral, 0n for none -- and on a treasury older than the cap. */
    maxStake: bigint
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
    /**
     * Pool money that defaulting borrowers walked away with, since the governor last cleared the
     * counter. The exchange rate never moves down for a loss, so an uncovered shortfall is recorded
     * here instead and `totalCoins` keeps its full claim.
     */
    deficit: bigint
    parent: Address | null
    participations: Dictionary<bigint, Participation>
    roundsImbalance: bigint
    stopped: boolean
    instantMint: boolean
    loanCodes: Dictionary<bigint, Cell>
    previousRate: bigint
    currentRate: bigint
    /**
     * Seconds that `previousRate` took to grow into `currentRate`, measured on chain. Divide the
     * year by this to annualise, and by nothing else.
     *
     * It is NOT a round length and NOT one round. The window spans two settlement releases, so in
     * steady state it is about two rounds -- 131072s where a round is 65536s -- and it widens
     * further across rounds the pool did not lend into. Two different errors follow from reaching
     * for a round length instead: the figure comes out roughly squared, and it would also hold
     * steady for a pool validating every other round whose true rate of growth had halved.
     *
     * Was named `roundDuration` through 5.x, when the window did span a single round.
     */
    windowDuration: bigint
    /** Start time of the most recent round whose reward is in `currentRate`. Only moves forward. */
    lastSettledRound: bigint
    halter: Address
    governor: Address
    proposedGovernor: Cell | null
    governanceFee: bigint
    /** Out of 65535 of each borrower's contractual share of a round's reward. 0 disables. */
    borrowerFee: bigint
    collectionCodes: Dictionary<bigint, Cell>
    billCodes: Dictionary<bigint, Cell>
    oldParents: Dictionary<bigint, unknown>
    /**
     * The rate observed one settlement release back, with the round it belongs to. Together with
     * `previousRate`/`currentRate` these give the three observations that make `windowDuration` a
     * sliding two-release window: `previousRate` -> `midRate` -> `currentRate`.
     *
     * Read them to annualise over a single release instead of two -- a noisier figure, but the one
     * to use if you want the most recent reward on its own rather than a smoothed rate.
     */
    midRate: bigint
    /** Start time of the round whose reward is in `midRate`. Only moves forward. */
    midRound: bigint
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
            .storeUint(src.borrowerRewardShare, 16)
            .storeCoins(src.loanAmount)
            .storeCoins(src.accrueAmount)
            .storeCoins(src.stakeAmount)
            .storeUint(src.requestFee, 16)
        if (src.maxStake !== undefined) {
            builder.storeCoins(src.maxStake)
        }
        builder.storeRef(src.newStakeMsg)
    },
    parse: function (src: Slice): Request {
        const request: Request = {
            minPayment: src.loadCoins(),
            borrowerRewardShare: src.loadUintBig(16),
            loanAmount: src.loadCoins(),
            accrueAmount: src.loadCoins(),
            stakeAmount: src.loadCoins(),
            requestFee: src.loadUintBig(16),
            newStakeMsg: Cell.EMPTY,
        }
        // max_stake is the last field and only requests stored since the stake-cap release carry it
        if (src.remainingBits > 0) {
            request.maxStake = src.loadCoins()
        }
        request.newStakeMsg = src.loadRef()
        return request
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
            sorted: src.loadDict(Dictionary.Keys.BigUint(120), sortedDictionaryValue),
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

    /**
     * Everything the treasury stores.
     *
     * The tuple is read positionally and the treasury grows it only by APPENDING, so `midRate` and
     * `midRound` are read last even though the treasury stores them beside the rate pair. Reading
     * past the end is what fails here: this needs a treasury carrying the two-round rate window, and
     * against an older one it throws rather than returning wrong numbers.
     */
    async getTreasuryState(provider: ContractProvider): Promise<TreasuryConfig> {
        const { stack } = await provider.get('get_treasury_state', [])
        return {
            totalCoins: stack.readBigNumber(),
            totalTokens: stack.readBigNumber(),
            totalStaking: stack.readBigNumber(),
            totalUnstaking: stack.readBigNumber(),
            totalBorrowersStake: stack.readBigNumber(),
            deficit: stack.readBigNumber(),
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
            windowDuration: stack.readBigNumber(),
            lastSettledRound: stack.readBigNumber(),
            halter: stack.readAddress(),
            governor: stack.readAddress(),
            proposedGovernor: stack.readCellOpt(),
            governanceFee: stack.readBigNumber(),
            borrowerFee: stack.readBigNumber(),
            collectionCodes: Dictionary.loadDirect(
                Dictionary.Keys.BigUint(32),
                Dictionary.Values.Cell(),
                stack.readCell(),
            ),
            billCodes: Dictionary.loadDirect(Dictionary.Keys.BigUint(32), Dictionary.Values.Cell(), stack.readCell()),
            oldParents: Dictionary.loadDirect(Dictionary.Keys.BigUint(256), emptyDictionaryValue, stack.readCellOpt()),
            // Appended by the treasury, so read last whatever their place in its storage. Property
            // order here is read order, which is why these two sit at the bottom.
            midRate: stack.readBigNumber(),
            midRound: stack.readBigNumber(),
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
            sorted: Dictionary.loadDirect(Dictionary.Keys.BigUint(120), sortedDictionaryValue, stack.readCellOpt()),
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

    /**
     * A single borrower's request within a round, found across whichever of the round's
     * dicts (requests/rejected/accepted/accrued/staked/recovering) currently holds it, so a
     * caller doesn't need to know that packing or call get_participation and search it by hand.
     *
     * Returns `undefined` when the round has no participation, or the borrower has no request
     * in any of its dicts. The getter leads with a `found` flag for exactly this, because
     * `stage` cannot tell: `participation::open` is also 0. Until 6.2.0 this read the tuple as
     * if that flag were not there, so every field came back one position off.
     *
     * The treasury's stake-cap release appends `max_stake` as a ninth value; it reads as 0n from
     * a treasury that returns eight.
     */
    async getLoanRequest(
        provider: ContractProvider,
        roundSince: bigint,
        borrower: Address,
    ): Promise<LoanRequest | undefined> {
        const tb = new TupleBuilder()
        tb.writeNumber(roundSince)
        tb.writeAddress(borrower)
        const { stack } = await provider.get('get_loan_request', tb.build())
        const found = stack.readBoolean()
        const stage = stack.readNumber()
        const minPayment = stack.readBigNumber()
        const borrowerRewardShare = stack.readBigNumber()
        const loanAmount = stack.readBigNumber()
        const accrueAmount = stack.readBigNumber()
        const stakeAmount = stack.readBigNumber()
        const requestFee = stack.readBigNumber()
        const maxStake = stack.remaining > 0 ? stack.readBigNumber() : 0n
        if (!found) {
            return undefined
        }
        return {
            stage,
            minPayment,
            borrowerRewardShare,
            loanAmount,
            accrueAmount,
            stakeAmount,
            requestFee,
            maxStake,
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
