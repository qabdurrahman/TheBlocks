/**
 * 🏆 THE BLOCKS - COMPREHENSIVE PRICE FEED CONFIGURATION
 * TriHacker Tournament 2025 - IIT Bombay
 * 
 * Maximum real price feeds from Chainlink, Pyth, and API3 on Sepolia
 */

// ========================================
// CHAINLINK SEPOLIA PRICE FEEDS (ALL AVAILABLE)
// ========================================
export const CHAINLINK_FEEDS = {
  // Crypto / USD
  "ETH/USD": "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  "BTC/USD": "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
  "LINK/USD": "0xc59E3633BAAC79493d908e63626716e204A45EdF",
  "DAI/USD": "0x14866185B1962B63C3Ea9E03Bc1da838bab34C19",
  "USDC/USD": "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
  "FORTH/USD": "0x070bF128E88A4520b3EfA65AB1e4Eb6F0F9E6632",
  "GHO/USD": "0x635A86F9fdD16Ff09A0701C305D3a845F1758b8E",
  "SNX/USD": "0xc0F82A46033b8BdBA4Bb0B0e28Bc2006F64355bC",
  "CRV/USD": "0xEE2B4f6E0d01d16B4eaa03Ea97b27e5b0d79Be54",

  // Forex Pairs
  "EUR/USD": "0x1a81afB8146aeFfCFc5E50e8479e826E7D55b910",
  "GBP/USD": "0x91FAB41F5f3bE955963a986366edAcff1aaeaa83",
  "JPY/USD": "0x8A6af2B75F23831ADc973ce6288e5329F63D86c6",
  "AUD/USD": "0xB0C712f98daE15264c8E26132BCC91C40aD4d5F9",
  "CHF/USD": "0x0b38e7F4e84D51E72F8F2B2d5D0F5A5DbE7E2a82",
  "CAD/USD": "0x97e91e2D01C29bF07EBb37276C72aA43d4a46651",

  // Cross Rates
  "ETH/BTC": "0x5fb1616F78dA7aFC9FF79e0371741a747D2a7F22",
  
  // Commodities
  "XAU/USD": "0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea", // Gold
  
} as const;

// ========================================
// PYTH NETWORK PRICE FEED IDs (UNIVERSAL)
// Works on all chains including Sepolia
// ========================================
export const PYTH_FEED_IDS = {
  // Major Cryptos
  "ETH/USD": "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  "BTC/USD": "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "SOL/USD": "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  "LINK/USD": "0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221",
  "AVAX/USD": "0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7",
  "MATIC/USD": "0x5de33440f6c205f2fb7c1ed88e51adc3e64ad89d0b3d4f10a18bd79b5f4abfae",
  "DOGE/USD": "0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c",
  "SHIB/USD": "0xf0d57deca57b3da2fe63a493f4c25925fdfd8edf834b20f93e1f84dbd1504d4a",
  "XRP/USD": "0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8",
  "ADA/USD": "0x2a01deaec9e51a579277b34b122399984d0bbf57e2458a7e42fecd2829867a0d",
  "DOT/USD": "0xca3eed9b267293f6595901c734c7525ce8ef49adafe8284f06c667f890f6cdb9",
  "LTC/USD": "0x6e3f3fa8253588df9326580180233eb791e03b443a3ba7a1d892e73874e19a54",
  "UNI/USD": "0x78d185a741d07edb3412b09008b7c5cfb9bbbd7d568bf00ba737b456ba171501",
  "AAVE/USD": "0x2b9ab1e972a281585084148ba1389800799bd4be63b957507db1349314e47445",
  "MKR/USD": "0x9375299e31c0deb9c6bc378e6329aab44cb48ec655552a70d4b9050346a30378",
  "ATOM/USD": "0xb00b60f88b03a6a625a8d1c048c3f66653edf217439983d037e7222c4e612819",
  "FIL/USD": "0x150ac9b959aee0051e4091f0ef5216d941f590e1c5e7f91cf7635b5c11628c0e",
  "NEAR/USD": "0xc415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750",
  "ARB/USD": "0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5",
  "OP/USD": "0x385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf",
  "APT/USD": "0x03ae4db29ed4ae33d323568895aa00337e658e348b37509f5372ae51f0af00d5",
  "SUI/USD": "0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744",
  "INJ/USD": "0x7a5bc1d2b56ad029048cd63964b3ad2776eadf812edc1a43a31406cb54bff592",
  "TIA/USD": "0x09f7c1d7dfbb7df2b8fe3d3d87ee94a2259d212da4f30c1f0540d066dfa44723",
  "JUP/USD": "0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996",
  "WIF/USD": "0x4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc",
  "PEPE/USD": "0xd69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4",
  "BONK/USD": "0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419",
  "PYTH/USD": "0x0bbf28e9a841a1cc788f6a361b17ca072d0ea3098a1e5df1c3922d06719579ff",
  "JTO/USD": "0xb43660a5f790c69354b0729a5ef9d50d68f1df92107540210b9cccba1f947cc2",
  "SEI/USD": "0x53614f1cb0c031d4af66c04cb9c756234adad0e1cee85303795091499a4084eb",
  "BLUR/USD": "0x856aac602516addee497edf6f50d39e8c95ae5fb0da1ed434a8c2ab9c3e877e9",
  "STRK/USD": "0x6a182399ff70ccf3e06024898942028204125a819e519a335ffa4579e66cd870",
  "MEME/USD": "0xcd2cee36951a571e035db0f67d4dd30f0a0e11c21be7cfde00dd40bf76e7e6fe",
  "RNDR/USD": "0xab7347771135fc733f8f38db462ba085ed3309955f42554a14fa13e855ac0e2f",
  "LDO/USD": "0xc63e2a7f37a04e5e614c07238bedb25dcc38927f36daf42c4e9b9f29c1ca1303",
  "RPL/USD": "0x24f94ac0fd8638e3fc41aab2e4df933e63f763351b640bf336a6ec70651c4503",
  "GRT/USD": "0x4d1f8dae0d96236fb98e8f47471a366ec3b1732b47041781934ca3a9bb2f35e7",
  "COMP/USD": "0x4a8e42861cabc5ecb50996f92e7cfa2bce3fd0a2423b0c44c9b423fb2bd25478",
  "CRV/USD": "0xa19d04ac696c7a6616d291c7e5d1377cc8be437c327b75adb5dc1bad745fcae8",
  "SNX/USD": "0x39d020f60982ed892abbcd4a06a276a9f29b7a4f4f7d45a4cc4d31a8def89f18",

  // Stablecoins
  "USDC/USD": "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
  "USDT/USD": "0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b",
  "DAI/USD": "0xb0948a5e5313200c632b51bb5ca32f6de0d36e9950a942d19751e833f70dabfd",

  // Forex
  "EUR/USD": "0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b",
  "GBP/USD": "0x84c2dde9633d93d1bcad84e244848f8d1f9d5bfb4b4dbcf3a7f8b5b3e1b4f0e4",
  "JPY/USD": "0xef2c98c804ba503c6a707e38be4dfbb16683775f195b091c38a37e9e6f988ae9",

  // Commodities
  "XAU/USD": "0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2", // Gold
  "XAG/USD": "0xf2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e", // Silver
  "WTI/USD": "0xf3b50961ff386d7cf6e93b0ff3a8ce0cd3aaa0c5b8d3a5ddc0f7c6a3e8b9f4c2", // Oil

} as const;

// ========================================
// API3 dAPI PROXIES (SEPOLIA)
// ========================================
export const API3_PROXIES = {
  "ETH/USD": "0x5b0cf2b36a65a6BB085D501B971e4c102B9Cd473",
  // API3 has limited Sepolia testnet feeds, ETH/USD is the main one
} as const;

// ========================================
// DEPLOYED CONTRACTS (SEPOLIA)
// ========================================
export const CONTRACTS = {
  // Our Custom Contracts - Intelligent Oracle System
  smartOracleSelector: "0x5F5B889E33f923dc34A6Eb9f5E7C7Db0FA3FF6A7",
  guardianOracleV2: "0x71027655D76832eA3d1F056C528485ddE1aec66a",
  api3Adapter: "0x21A9B38759414a12Aa6f6503345D6E0194eeD9eD",
  syncedPriceFeed: "0xa372663b57Ea5FA52c911FE81aa4B54b87AB6c96",
  multiOracleAggregator: "0x04b8dD0B1DabC4719a1cD8Ec2628425406F00A1C",
  attackSimulator: "0x5FFFeAf6B0b4d1685809959cA4B16E374827a8e2",
  
  // External Oracle Contracts
  chainlinkETHUSD: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  pythOracle: "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21",
  api3Proxy: "0x5b0cf2b36a65a6BB085D501B971e4c102B9Cd473",
} as const;

// ========================================
// ASSET CATEGORIES FOR UI
// ========================================
export const ASSET_CATEGORIES = {
  crypto: {
    label: "Cryptocurrencies",
    icon: "🪙",
    assets: ["ETH/USD", "BTC/USD", "LINK/USD", "SOL/USD", "AVAX/USD", "MATIC/USD", "XRP/USD", "ADA/USD", "DOT/USD"],
  },
  defi: {
    label: "DeFi Tokens",
    icon: "🔷",
    assets: ["UNI/USD", "AAVE/USD", "MKR/USD", "COMP/USD", "CRV/USD", "SNX/USD", "LDO/USD", "GRT/USD"],
  },
  layer2: {
    label: "Layer 2 & New Chains",
    icon: "⚡",
    assets: ["ARB/USD", "OP/USD", "APT/USD", "SUI/USD", "SEI/USD", "STRK/USD", "INJ/USD", "TIA/USD"],
  },
  meme: {
    label: "Meme Coins",
    icon: "🐕",
    assets: ["DOGE/USD", "SHIB/USD", "PEPE/USD", "BONK/USD", "WIF/USD", "MEME/USD"],
  },
  stablecoins: {
    label: "Stablecoins",
    icon: "💵",
    assets: ["USDC/USD", "USDT/USD", "DAI/USD"],
  },
  forex: {
    label: "Forex",
    icon: "💱",
    assets: ["EUR/USD", "GBP/USD", "JPY/USD", "AUD/USD", "CAD/USD", "CHF/USD"],
  },
  commodities: {
    label: "Commodities",
    icon: "🥇",
    assets: ["XAU/USD", "XAG/USD"],
  },
} as const;

// ========================================
// ABIs
// ========================================
export const CHAINLINK_ABI = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const PYTH_ABI = [
  {
    inputs: [{ name: "id", type: "bytes32" }],
    name: "getPriceUnsafe",
    outputs: [
      {
        components: [
          { name: "price", type: "int64" },
          { name: "conf", type: "uint64" },
          { name: "expo", type: "int32" },
          { name: "publishTime", type: "uint256" },
        ],
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "id", type: "bytes32" }],
    name: "getPriceNoOlderThan",
    outputs: [
      {
        components: [
          { name: "price", type: "int64" },
          { name: "conf", type: "uint64" },
          { name: "expo", type: "int32" },
          { name: "publishTime", type: "uint256" },
        ],
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "id", type: "bytes32" }],
    name: "priceFeedExists",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const SMART_ORACLE_SELECTOR_ABI = [
  {
    inputs: [{ name: "useCase", type: "uint8" }],
    name: "selectOptimalOracles",
    outputs: [
      {
        components: [
          { name: "selectedOracles", type: "uint8[]" },
          { name: "scores", type: "uint256[]" },
          { name: "aggregatedPrice", type: "uint256" },
          { name: "confidence", type: "uint256" },
          { name: "useCase", type: "uint8" },
          { name: "timestamp", type: "uint256" },
        ],
        type: "tuple",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "selectBestOracles",
    outputs: [
      {
        components: [
          { name: "selectedOracles", type: "uint8[]" },
          { name: "scores", type: "uint256[]" },
          { name: "aggregatedPrice", type: "uint256" },
          { name: "confidence", type: "uint256" },
          { name: "useCase", type: "uint8" },
          { name: "timestamp", type: "uint256" },
        ],
        type: "tuple",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "lastSelection",
    outputs: [
      { name: "aggregatedPrice", type: "uint256" },
      { name: "confidence", type: "uint256" },
      { name: "useCase", type: "uint8" },
      { name: "timestamp", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const GUARDIAN_ORACLE_V2_ABI = [
  {
    inputs: [],
    name: "getSecuredPrice",
    outputs: [
      { name: "price", type: "int256" },
      { name: "twapPrice", type: "int256" },
      { name: "confidence", type: "uint8" },
      { name: "isSecure", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getTWAP",
    outputs: [
      { name: "twapPrice", type: "int256" },
      { name: "observationCount", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "metrics",
    outputs: [
      { name: "lastUpdateBlock", type: "uint256" },
      { name: "lastPrice", type: "int256" },
      { name: "priceVelocity", type: "int256" },
      { name: "volatilityIndex", type: "uint256" },
      { name: "anomalyCount", type: "uint256" },
      { name: "lastAnomalyBlock", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "circuitBreakerTripped",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "updateAndGetPrice",
    outputs: [
      { name: "price", type: "int256" },
      { name: "twapPrice", type: "int256" },
      { name: "confidence", type: "uint8" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getPriceHistoryLength",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const API3_ADAPTER_ABI = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getETHUSDPrice",
    outputs: [
      { name: "price", type: "int256" },
      { name: "timestamp", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// SyncedPriceFeed ABI (multi-oracle aggregator with sync capability)
export const SYNCED_PRICE_FEED_ABI = [
  {
    inputs: [],
    name: "getAggregatedPrice",
    outputs: [
      { name: "price", type: "int256" },
      { name: "timestamp", type: "uint256" },
      { name: "sources", type: "uint8" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getLatestPrices",
    outputs: [
      { name: "chainlinkPrice", type: "int256" },
      { name: "pythPrice", type: "int256" },
      { name: "api3Price", type: "int256" },
      { name: "timestamps", type: "uint256[3]" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "syncAllPrices",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getSourceCount",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ========================================
// HELPER TYPES
// ========================================
export type ChainlinkFeedKey = keyof typeof CHAINLINK_FEEDS;
export type PythFeedKey = keyof typeof PYTH_FEED_IDS;
export type AssetCategory = keyof typeof ASSET_CATEGORIES;

export interface PriceData {
  symbol: string;
  price: number;
  timestamp: number;
  source: "chainlink" | "pyth" | "api3";
  confidence?: number;
  status: "live" | "stale" | "error";
}
