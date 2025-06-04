
require("dotenv").config();

const axios = require("axios");
const ethers = require("ethers");

//const WALLET = process.env.WALLET;
//const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CHAIN_ID = process.env.CHAIN_ID;
const TOKEN0_ADDRESS = process.env.TOKEN0_ADDRESS;
const TOKEN1_ADDRESS = process.env.TOKEN1_ADDRESS;
//const API_KEY = process.env.API_KEY;
const ROUTER_ADDRESS = process.env.ROUTER_ADDRESS;
//const PROVIDER_URL = process.env.PROVIDER_URL;
const AMOUNT = process.env.AMOUNT;

const LOWER_BOUND = 0.01;
const UPPER_BOUND = 0.02;

const PANCAKESWAP_ABI = require("./abi.pancakeswap.json");
const ERC20_ABI = require("./abi.erc20.json");

const PROVIDER_URL = new ethers.JsonRpcProvider(process.env.PROVIDER_URL);

let wallet = process.env.WALLET;

let signer = process.env.PRIVATE_KEY ? new ethers.Wallet(process.env.PRIVATE_KEY, PROVIDER_URL) : undefined;
let router = signer?.provider ? new ethers.Contract(ROUTER_ADDRESS, PANCAKESWAP_ABI, signer) : undefined;
let token0 = signer?.provider ? new ethers.Contract(TOKEN0_ADDRESS, ERC20_ABI, signer) : undefined;
let token1 = signer?.provider ? new ethers.Contract(TOKEN1_ADDRESS, ERC20_ABI, signer) : undefined;

let api_key = process.env.API_KEY;

let hit_upper_bound = false;

async function getPrice(tokenAtMainnet) {
    const USDT_MAINNET = "0x55d398326f99059fF775485246999027B3197955";

    const qs = {
        chainId: CHAIN_ID,
        sellToken: tokenAtMainnet,
        buyToken: USDT_MAINNET,
        sellAmount: ethers.parseEther("1"),
    }

    const { data } = await axios.get(
        `https://api.0x.org/swap/permit2/price?${new URLSearchParams(qs).toString()}`,
        {
            headers: {
            "0x-api-key": "e74fe149-0d04-4d64-955e-946e8c2c2155",
            "0x-version": "v2"
            }
        }
    )

    if (!data || !data.buyAmount) {
        console.error('Resposta inválida da API');
        return null; 
    }

    return ethers.formatEther(data.buyAmount);
}

async function executeCycle() {
    const usdPrice = await getPrice("0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"); // CAKE, pancakeswap token
    console.log("USD " + usdPrice);
    if(!hit_upper_bound) {
        await swap(TOKEN0_ADDRESS, TOKEN1_ADDRESS, ethers.parseEther(AMOUNT));
        if(usdPrice > UPPER_BOUND){
            hit_upper_bound = true;
        }
    }
    else {
        await swap(TOKEN1_ADDRESS, TOKEN0_ADDRESS, ethers.parseEther(AMOUNT));
        if(usdPrice < LOWER_BOUND){
            hit_upper_bound = false;
        }
    }
}

async function approve() {
    console.log("Aprovando o token...");
    const tx = await token0.approve(ROUTER_ADDRESS, ethers.parseEther(AMOUNT));
    console.log("Hash da transação:", tx.hash);
    console.log("Aguardando a transação ser confirmada...");
    const receipt = await tx.wait();
    console.log("Aprovado com sucesso!");
}


async function swap (tokenIn, tokenOut, amountIn) {
    console.log("Fazendo os parâmetros...");
    console.log("Token in:", tokenIn);
    console.log("Token out:", tokenOut);
    const params = {
        tokenIn,
        tokenOut,
        fee: 2500,//0.25% * 10000
        recipient: wallet,
        deadline: Math.ceil(Date.now() / 1000) + 10,
        amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
    }
    const tx = await router.exactInputSingle(params, { 
        from: wallet,
        gasPrice: ethers.parseUnits ("10", "gwei"),
        gasLimit: 250000
    })

    console.log("Hash da transação:", tx.hash);
    console.log("Aguardando a transação ser confirmada...");
    const receipt = await tx.wait();

    const amountOut = ethers.toBigInt(receipt.events[0].data);
    console.log("Amount out:", ethers.formatEther(amountOut));

    console.log("Swap realizado com sucesso!");
}

async function start(){
    const private_key = process.argv[2];
    const wallet_ = process.argv[3];
    const apiKey = process.argv[4];

    console.log("Chave privada:", private_key);
    //console.log("Chave de API:", apiKey);

    wallet = process.env.WALLET ? wallet : wallet_;

    signer = process.env.PRIVATE_KEY ? signer : new ethers.Wallet(private_key, PROVIDER_URL);
    router = process.env.PRIVATE_KEY ? router : new ethers.Contract(ROUTER_ADDRESS, PANCAKESWAP_ABI, signer);
    token0 = process.env.PRIVATE_KEY ? token0 : new ethers.Contract(TOKEN0_ADDRESS, ERC20_ABI, signer);
    token1 = process.env.PRIVATE_KEY ? token1 : new ethers.Contract(TOKEN1_ADDRESS, ERC20_ABI, signer);

    api_key = process.env.API_KEY ? api_key : apiKey;

    console.log("Chave de API:", api_key);

    console.log("Iniciando o bot...");

    executeCycle();
    setInterval(executeCycle, process.env.INTERVAL);
}

start();