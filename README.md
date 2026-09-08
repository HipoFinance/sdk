# Hipo SDK

Hipo is a decentralized, permission-less, open-source liquid staking protocol on TON blockchain. Visit [Hipo.Finance](https://hipo.finance) for more information or read the [docs](https://docs.hipo.finance).

This SDK helps with connecting to Hipo liquid staking protocol on web clients.

The [sdk-example](https://github.com/HipoFinance/sdk-example) project uses this project as a dependency and creates a simple web application to Stake or Unstake on Hipo.

`Constants` include protocol addresses on MainNet and TestNet, op-codes for deposit and unstake, and recommended fees for each operation.

`Parent` helps in finding the jetton wallet address for an address.

`Wallet` provides access to jetton wallet state, in particular hGRAM balance (formerly hTON).

`Treasury` has the functionality to parse the current state of Hipo Treasury, including the hGRAM/GRAM exchange rate fields (`currentRate`, `previousRate`, and `windowDuration` — the interval those two grew over, which is what an APY should be annualised by, and which spans two settlement releases rather than one round), the intermediate observation `midRate`/`midRound`, the deficit counter, round times, fees, participations, and loan/collection/bill addresses.

Do not annualise the rate pair by hand. `computeApy(state)` returns the figure to display — growth
over the treasury's published window, which spans two settlement releases and is therefore about
two rounds, never one. Dividing the year by a round length instead roughly squares the result, and
that has shipped before. `computeLatestApy(state)` gives the noisier single-release reading, for
when you want the most recent round's reward on its own rather than a rate to quote; expect the two
to disagree, because that gap is the smoothing working.

`Helpers` create deposit/unstake messages for TonConnect, and `minimumDepositAmount` computes the smallest deposit that the treasury will accept at the current exchange rate.

> Terminology: GRAM is the network coin (formerly Toncoin/TON) and hGRAM is Hipo's liquid staking token (formerly hTON). The network is still the TON blockchain.
