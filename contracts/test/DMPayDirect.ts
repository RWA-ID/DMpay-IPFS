import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";
import { parseEther, parseUnits, getAddress } from "viem";

const PRICE_USDC = parseUnits("5", 6);          // 5 USDC
const PRICE_ETH = parseEther("0.001");          // 0.001 ETH
const LIFETIME_USDC = parseUnits("50", 6);
const LIFETIME_ETH = parseEther("0.01");
const FEE_BPS = 250n;
const BPS_BASE = 10000n;
const feeOf = (n: bigint) => (n * FEE_BPS) / BPS_BASE;

describe("DMPayDirect", async () => {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [owner, alice, bob, carol, treasury] = await viem.getWalletClients();

  async function fixture() {
    const usdc = await viem.deployContract("MockUSDC");
    const dm = await viem.deployContract("DMPayDirect", [usdc.address, treasury.account.address]);
    // Mint USDC to everyone
    for (const w of [alice, bob, carol]) {
      await usdc.write.mint([w.account.address, parseUnits("1000", 6)]);
      // approve dm
      const usdcAsUser = await viem.getContractAt("MockUSDC", usdc.address, { client: { wallet: w } });
      await usdcAsUser.write.approve([dm.address, parseUnits("1000", 6)]);
    }
    return { usdc, dm };
  }

  it("setPrice writes all four tiers", async () => {
    const { dm } = await fixture();
    const dmAlice = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: alice } });
    await dmAlice.write.setPrice([PRICE_USDC, PRICE_ETH, LIFETIME_USDC, LIFETIME_ETH]);
    const p = await dm.read.priceOf([alice.account.address]);
    assert.equal(p[0], PRICE_USDC);
    assert.equal(p[1], PRICE_ETH);
    assert.equal(p[2], LIFETIME_USDC);
    assert.equal(p[3], LIFETIME_ETH);
  });

  it("openConversationUSDC splits 97.5/2.5 and forwards atomically", async () => {
    const { usdc, dm } = await fixture();
    const dmAlice = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: alice } });
    await dmAlice.write.setPrice([PRICE_USDC, 0n, 0n, 0n]);

    const dmBob = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: bob } });
    const aliceBefore = await usdc.read.balanceOf([alice.account.address]);
    const treasuryBefore = await usdc.read.balanceOf([treasury.account.address]);

    await dmBob.write.openConversationUSDC([alice.account.address]);

    const fee = feeOf(PRICE_USDC);
    assert.equal(await usdc.read.balanceOf([alice.account.address]) - aliceBefore, PRICE_USDC - fee);
    assert.equal(await usdc.read.balanceOf([treasury.account.address]) - treasuryBefore, fee);
  });

  it("openConversationUSDC reverts if recipient hasn't enabled USDC", async () => {
    const { dm } = await fixture();
    const dmBob = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: bob } });
    await assert.rejects(dmBob.write.openConversationUSDC([carol.account.address]));
  });

  it("openConversationETH splits and forwards", async () => {
    const { dm } = await fixture();
    const dmAlice = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: alice } });
    await dmAlice.write.setPrice([0n, PRICE_ETH, 0n, 0n]);

    const dmBob = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: bob } });
    const aliceBefore = await publicClient.getBalance({ address: alice.account.address });

    await dmBob.write.openConversationETH([alice.account.address], { value: PRICE_ETH });
    const fee = feeOf(PRICE_ETH);
    assert.equal(await publicClient.getBalance({ address: alice.account.address }) - aliceBefore, PRICE_ETH - fee);
    assert.equal(await dm.read.accumulatedEthFees(), fee);
  });

  it("openConversationETH reverts on wrong msg.value", async () => {
    const { dm } = await fixture();
    const dmAlice = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: alice } });
    await dmAlice.write.setPrice([0n, PRICE_ETH, 0n, 0n]);
    const dmBob = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: bob } });
    await assert.rejects(dmBob.write.openConversationETH([alice.account.address], { value: PRICE_ETH - 1n }));
  });

  it("buyLifetimePassUSDC grants permanent access; second buy reverts", async () => {
    const { dm } = await fixture();
    const dmAlice = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: alice } });
    await dmAlice.write.setPrice([0n, 0n, LIFETIME_USDC, 0n]);
    const dmBob = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: bob } });
    await dmBob.write.buyLifetimePassUSDC([alice.account.address]);
    assert.equal(await dm.read.hasLifetimePass([alice.account.address, bob.account.address]), true);
    await assert.rejects(dmBob.write.buyLifetimePassUSDC([alice.account.address]));
  });

  it("buyLifetimePassETH grants and reverts on duplicate", async () => {
    const { dm } = await fixture();
    const dmAlice = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: alice } });
    await dmAlice.write.setPrice([0n, 0n, 0n, LIFETIME_ETH]);
    const dmBob = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: bob } });
    await dmBob.write.buyLifetimePassETH([alice.account.address], { value: LIFETIME_ETH });
    assert.equal(await dm.read.hasLifetimePass([alice.account.address, bob.account.address]), true);
    await assert.rejects(dmBob.write.buyLifetimePassETH([alice.account.address], { value: LIFETIME_ETH }));
  });

  it("payMessageUSDC and payMessageETH process arbitrary amounts", async () => {
    const { usdc, dm } = await fixture();
    const dmBob = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: bob } });
    const aliceBefore = await usdc.read.balanceOf([alice.account.address]);
    await dmBob.write.payMessageUSDC([alice.account.address, parseUnits("2", 6)]);
    assert.equal(await usdc.read.balanceOf([alice.account.address]) - aliceBefore, parseUnits("2", 6) - feeOf(parseUnits("2", 6)));

    const aliceEthBefore = await publicClient.getBalance({ address: alice.account.address });
    await dmBob.write.payMessageETH([alice.account.address], { value: parseEther("0.01") });
    assert.equal(await publicClient.getBalance({ address: alice.account.address }) - aliceEthBefore, parseEther("0.01") - feeOf(parseEther("0.01")));
  });

  // ----- Groups -----

  it("createGroup assigns id 0, creator is auto-member", async () => {
    const { dm } = await fixture();
    const dmAlice = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: alice } });
    await dmAlice.write.createGroup([PRICE_USDC, PRICE_ETH, 3n]);
    const g = await dm.read.groups([0n]);
    assert.equal(getAddress(g[0]), getAddress(alice.account.address)); // creator
    assert.equal(g[4], 1n);                                            // memberCount
    assert.equal(g[5], true);                                          // active
    assert.equal(await dm.read.isGroupMember([0n, alice.account.address]), true);
  });

  it("joinGroupUSDC pays creator and adds member", async () => {
    const { usdc, dm } = await fixture();
    const dmAlice = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: alice } });
    await dmAlice.write.createGroup([PRICE_USDC, 0n, 0n]);
    const dmBob = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: bob } });
    const aliceBefore = await usdc.read.balanceOf([alice.account.address]);
    await dmBob.write.joinGroupUSDC([0n]);
    assert.equal(await dm.read.isGroupMember([0n, bob.account.address]), true);
    assert.equal(await usdc.read.balanceOf([alice.account.address]) - aliceBefore, PRICE_USDC - feeOf(PRICE_USDC));
  });

  it("joinGroupETH respects msg.value", async () => {
    const { dm } = await fixture();
    const dmAlice = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: alice } });
    await dmAlice.write.createGroup([0n, PRICE_ETH, 0n]);
    const dmBob = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: bob } });
    await assert.rejects(dmBob.write.joinGroupETH([0n], { value: PRICE_ETH - 1n }));
    await dmBob.write.joinGroupETH([0n], { value: PRICE_ETH });
    assert.equal(await dm.read.isGroupMember([0n, bob.account.address]), true);
  });

  it("group capacity enforced; double-join reverts; closed group rejects", async () => {
    const { dm } = await fixture();
    const dmAlice = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: alice } });
    await dmAlice.write.createGroup([PRICE_USDC, 0n, 2n]); // capacity 2, alice is 1
    const dmBob = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: bob } });
    await dmBob.write.joinGroupUSDC([0n]);
    await assert.rejects(dmBob.write.joinGroupUSDC([0n])); // double-join
    const dmCarol = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: carol } });
    await assert.rejects(dmCarol.write.joinGroupUSDC([0n])); // full

    // close + reject
    await dmAlice.write.createGroup([PRICE_USDC, 0n, 0n]); // id 1
    await dmAlice.write.closeGroup([1n]);
    await assert.rejects(dmCarol.write.joinGroupUSDC([1n]));
  });

  it("setGroupXmtpId only by creator", async () => {
    const { dm } = await fixture();
    const dmAlice = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: alice } });
    await dmAlice.write.createGroup([PRICE_USDC, 0n, 0n]);
    const id = "0x" + "ab".repeat(32) as `0x${string}`;
    await dmAlice.write.setGroupXmtpId([0n, id]);
    const g = await dm.read.groups([0n]);
    assert.equal(g[6], id);
    const dmBob = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: bob } });
    await assert.rejects(dmBob.write.setGroupXmtpId([0n, id]));
  });

  // ----- Admin -----

  it("withdrawEthFees transfers accumulated to treasury", async () => {
    const { dm } = await fixture();
    const dmAlice = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: alice } });
    await dmAlice.write.setPrice([0n, PRICE_ETH, 0n, 0n]);
    const dmBob = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: bob } });
    await dmBob.write.openConversationETH([alice.account.address], { value: PRICE_ETH });
    const treasuryBefore = await publicClient.getBalance({ address: treasury.account.address });
    const dmOwner = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: owner } });
    await dmOwner.write.withdrawEthFees();
    assert.equal(await dm.read.accumulatedEthFees(), 0n);
    assert.equal(await publicClient.getBalance({ address: treasury.account.address }) - treasuryBefore, feeOf(PRICE_ETH));
  });

  it("setTreasury only by owner", async () => {
    const { dm } = await fixture();
    const dmAlice = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: alice } });
    await assert.rejects(dmAlice.write.setTreasury([alice.account.address]));
    const dmOwner = await viem.getContractAt("DMPayDirect", dm.address, { client: { wallet: owner } });
    await dmOwner.write.setTreasury([alice.account.address]);
    assert.equal(getAddress(await dm.read.treasury()), getAddress(alice.account.address));
  });
});
