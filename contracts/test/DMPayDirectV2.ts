import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { parseEther, parseUnits } from "viem";

const PRICE_USDC = parseUnits("5", 6);
const PRICE_ETH = parseEther("0.001");
const LIFETIME_USDC = parseUnits("50", 6);
const LIFETIME_ETH = parseEther("0.01");
const GROUP_USDC = parseUnits("10", 6);
const GROUP_ETH = parseEther("0.002");

describe("DMPayDirectV2", async () => {
  const { viem } = await network.connect();
  const [_owner, alice, bob, carol, dave, treasury] = await viem.getWalletClients();

  async function fixture() {
    const usdc = await viem.deployContract("MockUSDC");
    const dm = await viem.deployContract("DMPayDirectV2", [usdc.address, treasury.account.address]);
    for (const w of [alice, bob, carol, dave]) {
      await usdc.write.mint([w.account.address, parseUnits("1000", 6)]);
      const usdcAsUser = await viem.getContractAt("MockUSDC", usdc.address, { client: { wallet: w } });
      await usdcAsUser.write.approve([dm.address, parseUnits("1000", 6)]);
    }
    return { usdc, dm };
  }

  function asUser(addr: `0x${string}`, wallet: typeof alice) {
    return viem.getContractAt("DMPayDirectV2", addr, { client: { wallet } });
  }

  // ---------- Block & close primitives ----------

  it("blockSender prevents openConversation*, payMessage*, joinGroup*", async () => {
    const { dm } = await fixture();
    const dmAlice = await asUser(dm.address, alice);
    const dmBob = await asUser(dm.address, bob);

    await dmAlice.write.setPrice([PRICE_USDC, PRICE_ETH, 0n, 0n]);
    await dmAlice.write.blockSender([bob.account.address]);

    await assert.rejects(dmBob.write.openConversationUSDC([alice.account.address]), /blocked/);
    await assert.rejects(
      dmBob.write.openConversationETH([alice.account.address], { value: PRICE_ETH }),
      /blocked/,
    );
    await assert.rejects(dmBob.write.payMessageUSDC([alice.account.address, PRICE_USDC]), /blocked/);
    await assert.rejects(
      dmBob.write.payMessageETH([alice.account.address], { value: PRICE_ETH }),
      /blocked/,
    );
  });

  it("unblockSender restores access", async () => {
    const { dm } = await fixture();
    const dmAlice = await asUser(dm.address, alice);
    const dmBob = await asUser(dm.address, bob);

    await dmAlice.write.setPrice([PRICE_USDC, 0n, 0n, 0n]);
    await dmAlice.write.blockSender([bob.account.address]);
    await assert.rejects(dmBob.write.openConversationUSDC([alice.account.address]), /blocked/);

    await dmAlice.write.unblockSender([bob.account.address]);
    await dmBob.write.openConversationUSDC([alice.account.address]); // succeeds
    assert.equal(await dm.read.isUnlocked([alice.account.address, bob.account.address]), true);
  });

  it("closeConversation invalidates open until sender re-opens", async () => {
    const { dm } = await fixture();
    const dmAlice = await asUser(dm.address, alice);
    const dmBob = await asUser(dm.address, bob);

    await dmAlice.write.setPrice([PRICE_USDC, 0n, 0n, 0n]);
    await dmBob.write.openConversationUSDC([alice.account.address]);
    assert.equal(await dm.read.isUnlocked([alice.account.address, bob.account.address]), true);

    // Hardhat advances block timestamp by ≥1s per tx so closedAt > openedAt here.
    await dmAlice.write.closeConversation([bob.account.address]);
    assert.equal(await dm.read.isUnlocked([alice.account.address, bob.account.address]), false);

    await dmBob.write.openConversationUSDC([alice.account.address]);
    assert.equal(await dm.read.isUnlocked([alice.account.address, bob.account.address]), true);
  });

  // ---------- Lifetime bypass ----------

  it("lifetime pass holders bypass block and close", async () => {
    const { dm } = await fixture();
    const dmAlice = await asUser(dm.address, alice);
    const dmBob = await asUser(dm.address, bob);

    await dmAlice.write.setPrice([PRICE_USDC, 0n, LIFETIME_USDC, 0n]);
    await dmBob.write.buyLifetimePassUSDC([alice.account.address]);
    assert.equal(await dm.read.hasLifetimePass([alice.account.address, bob.account.address]), true);

    // Block + close should be no-ops for lifetime holders
    await dmAlice.write.blockSender([bob.account.address]);
    await dmAlice.write.closeConversation([bob.account.address]);

    assert.equal(await dm.read.isUnlocked([alice.account.address, bob.account.address]), true);
    // payMessage still works
    await dmBob.write.payMessageUSDC([alice.account.address, PRICE_USDC]);
  });

  it("a blocked sender can still buy a lifetime pass (escape hatch)", async () => {
    const { dm } = await fixture();
    const dmAlice = await asUser(dm.address, alice);
    const dmBob = await asUser(dm.address, bob);

    await dmAlice.write.setPrice([PRICE_USDC, 0n, LIFETIME_USDC, 0n]);
    await dmAlice.write.blockSender([bob.account.address]);

    await dmBob.write.buyLifetimePassUSDC([alice.account.address]);
    assert.equal(await dm.read.isUnlocked([alice.account.address, bob.account.address]), true);
  });

  it("recipient can fully refuse buy-the-pass escape by zeroing lifetime tiers", async () => {
    const { dm } = await fixture();
    const dmAlice = await asUser(dm.address, alice);
    const dmBob = await asUser(dm.address, bob);

    await dmAlice.write.setPrice([PRICE_USDC, 0n, 0n, 0n]); // lifetime disabled
    await dmAlice.write.blockSender([bob.account.address]);

    await assert.rejects(dmBob.write.buyLifetimePassUSDC([alice.account.address]), /Lifetime USDC not offered/);
    await assert.rejects(dmBob.write.openConversationUSDC([alice.account.address]), /blocked/);
  });

  // ---------- Groups + lifetime ----------

  it("lifetime pass = free entry to creator's USDC group", async () => {
    const { usdc, dm } = await fixture();
    const dmAlice = await asUser(dm.address, alice);
    const dmBob = await asUser(dm.address, bob);

    await dmAlice.write.setPrice([0n, 0n, LIFETIME_USDC, 0n]);
    await dmBob.write.buyLifetimePassUSDC([alice.account.address]);

    await dmAlice.write.createGroup([GROUP_USDC, 0n, 0n]);
    const id = 0n;
    const bobUsdcBefore = await usdc.read.balanceOf([bob.account.address]);
    await dmBob.write.joinGroupUSDC([id]);
    const bobUsdcAfter = await usdc.read.balanceOf([bob.account.address]);
    assert.equal(bobUsdcAfter, bobUsdcBefore, "lifetime joiner should pay nothing");
    assert.equal(await dm.read.isGroupMember([id, bob.account.address]), true);
  });

  it("lifetime pass = free entry to ETH group (msg.value must be 0)", async () => {
    const { dm } = await fixture();
    const dmAlice = await asUser(dm.address, alice);
    const dmBob = await asUser(dm.address, bob);

    await dmAlice.write.setPrice([0n, 0n, 0n, LIFETIME_ETH]);
    await dmBob.write.buyLifetimePassETH([alice.account.address], { value: LIFETIME_ETH });
    await dmAlice.write.createGroup([0n, GROUP_ETH, 0n]);
    const id = 0n;

    // Free join with no value
    await dmBob.write.joinGroupETH([id]);
    assert.equal(await dm.read.isGroupMember([id, bob.account.address]), true);

    // Sending eth as a lifetime joiner is rejected (defensive)
    const dmCarol = await asUser(dm.address, carol);
    await assert.rejects(
      dmCarol.write.joinGroupETH([id], { value: GROUP_ETH + 1n }),
      /wrong eth amount/,
    );
  });

  it("blocked sender cannot join group unless lifetime", async () => {
    const { dm } = await fixture();
    const dmAlice = await asUser(dm.address, alice);
    const dmBob = await asUser(dm.address, bob);
    const dmCarol = await asUser(dm.address, carol);

    await dmAlice.write.setPrice([0n, 0n, LIFETIME_USDC, 0n]);
    await dmAlice.write.createGroup([GROUP_USDC, 0n, 0n]);
    const id = 0n;

    await dmAlice.write.blockSender([bob.account.address]);
    await assert.rejects(dmBob.write.joinGroupUSDC([id]), /blocked/);

    // Bob buys lifetime → unblocked → can join
    await dmBob.write.buyLifetimePassUSDC([alice.account.address]);
    await dmBob.write.joinGroupUSDC([id]);
    assert.equal(await dm.read.isGroupMember([id, bob.account.address]), true);

    // Carol (no block, no pass) joins normally
    await dmCarol.write.joinGroupUSDC([id]);
    assert.equal(await dm.read.isGroupMember([id, carol.account.address]), true);
  });

  it("removeGroupMember evicts member and they can re-pay to rejoin", async () => {
    const { dm } = await fixture();
    const dmAlice = await asUser(dm.address, alice);
    const dmBob = await asUser(dm.address, bob);

    await dmAlice.write.createGroup([GROUP_USDC, 0n, 0n]);
    const id = 0n;

    await dmBob.write.joinGroupUSDC([id]);
    const g1 = await dm.read.groups([id]);
    assert.equal(g1[4], 2n); // memberCount

    await dmAlice.write.removeGroupMember([id, bob.account.address]);
    assert.equal(await dm.read.isGroupMember([id, bob.account.address]), false);
    const g2 = await dm.read.groups([id]);
    assert.equal(g2[4], 1n);

    // Bob can re-pay to rejoin
    await dmBob.write.joinGroupUSDC([id]);
    assert.equal(await dm.read.isGroupMember([id, bob.account.address]), true);
  });

  it("only creator can removeGroupMember and cannot remove themselves", async () => {
    const { dm } = await fixture();
    const dmAlice = await asUser(dm.address, alice);
    const dmBob = await asUser(dm.address, bob);
    const dmCarol = await asUser(dm.address, carol);

    await dmAlice.write.createGroup([GROUP_USDC, 0n, 0n]);
    const id = 0n;
    await dmBob.write.joinGroupUSDC([id]);

    await assert.rejects(dmCarol.write.removeGroupMember([id, bob.account.address]), /not creator/);
    await assert.rejects(dmAlice.write.removeGroupMember([id, alice.account.address]), /cannot remove creator/);
    await assert.rejects(dmAlice.write.removeGroupMember([id, dave.account.address]), /not member/);
  });

  // ---------- Sanity: V1 surface still works ----------

  it("openConversationUSDC still splits 97.5/2.5", async () => {
    const { usdc, dm } = await fixture();
    const dmAlice = await asUser(dm.address, alice);
    const dmBob = await asUser(dm.address, bob);

    await dmAlice.write.setPrice([PRICE_USDC, 0n, 0n, 0n]);
    const aliceBefore = await usdc.read.balanceOf([alice.account.address]);
    const treasuryBefore = await usdc.read.balanceOf([treasury.account.address]);
    await dmBob.write.openConversationUSDC([alice.account.address]);
    const aliceAfter = await usdc.read.balanceOf([alice.account.address]);
    const treasuryAfter = await usdc.read.balanceOf([treasury.account.address]);

    const fee = (PRICE_USDC * 250n) / 10000n;
    assert.equal(aliceAfter - aliceBefore, PRICE_USDC - fee);
    assert.equal(treasuryAfter - treasuryBefore, fee);
  });
});
