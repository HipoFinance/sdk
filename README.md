# Hipo SDK

hTON is a decentralized, permission-less, open-source liquid staking protocol on TON blockchain. Visit [Hipo.Finance](https://hipo.finance) for more information or read the [docs](https://docs.hipo.finance).

This SDK helps with connecting to Hipo liquid staking protocol on web clients.

The [sdk-example](https://github.com/HipoFinance/sdk-example) project uses this project as a dependency and creates a simple web application to Stake or Unstake on Hipo.

`Constants` include protocol addresses on MainNet and TestNet, op-codes for deposit and unstake, and recommended fees for each operation.

`Parent` helps in finding the jetton wallet address for an address.

`Wallet` provides access to jetton wallet state, in particular hTON balance.

`Treasury` has the functionality to parse the current state of Hipo Treasury.
