import { LegalLayout, Section, SubHeading, List, A, Mono } from './LegalLayout';
import { SITE_HOST } from '../lib/site';
import { DMPAY_DIRECT_ADDRESS } from '../lib/contracts';

export function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" updated="July 2026">
      <Section heading="1. Overview">
        <p>
          DMpay ("DMpay", "we", "us") is a non-custodial pay-to-DM protocol on Ethereum. This policy
          explains what data the DMpay interface at <Mono>{SITE_HOST}</Mono> touches, where it goes,
          and what control you have over it.
        </p>
        <p>
          DMpay has no backend, no accounts, and no user database. We do not operate a server that
          receives your data. The interface is a static application that runs entirely in your
          browser and talks directly to public infrastructure — Ethereum, XMTP, ENS and IPFS — using
          your own wallet. There is no sign-up, and there is nothing for us to log you into.
        </p>
      </Section>

      <Section heading="2. What Is Public By Design">
        <div>
          <SubHeading>2.1 Onchain data</SubHeading>
          <p>
            Setting your price, opening a paid conversation, buying a lifetime pass and withdrawing
            earnings are Ethereum transactions sent to the DMpay smart contract at{' '}
            <Mono>{DMPAY_DIRECT_ADDRESS}</Mono>. Your wallet address, your price, and the amount and
            timing of every payment are written to the public blockchain. This data is permanent,
            worldwide, and cannot be deleted or altered by us or by you.
          </p>
        </div>
        <div>
          <SubHeading>2.2 ENS records</SubHeading>
          <p>
            If you register a <Mono>.eth</Mono> name or edit your records through DMpay, the name,
            your address, your chosen text records (bio, website, X handle, GitHub handle, avatar)
            and your primary-name setting are written to the public ENS registry and resolver
            contracts. ENS data is public and permanent in the same way.
          </p>
        </div>
        <div>
          <SubHeading>2.3 Social graph</SubHeading>
          <p>
            Profiles display follower and following counts read from the Ethereum Follow Protocol via{' '}
            <A href="https://api.ethfollow.xyz">api.ethfollow.xyz</A>. Requesting these stats
            discloses the address being viewed to that service.
          </p>
        </div>
      </Section>

      <Section heading="3. Messages">
        <p>
          Messages are sent over <A href="https://xmtp.org">XMTP</A> and are end-to-end encrypted.
          DMpay cannot read your message content — we have no key, no server, and no copy. Message
          delivery and storage are handled by the XMTP network under its own{' '}
          <A href="https://xmtp.org/privacy">privacy policy</A>. Metadata inherent to any messaging
          network — that two addresses have a conversation, and when — is visible to that network.
        </p>
        <p>
          File attachments are encrypted in your browser before they leave your device. Only the
          resulting ciphertext is pinned to IPFS via <A href="https://pinata.cloud">Pinata</A>; the
          decryption key travels inside the encrypted XMTP message. IPFS is a public network:
          encrypted blobs, once pinned, may be replicated by other nodes and should be treated as
          permanent.
        </p>
      </Section>

      <Section heading="4. Data Stored On Your Device">
        <p>
          DMpay does not use cookies and does not set any tracking identifier. The following stays
          in your browser and never reaches us:
        </p>
        <List>
          <li>
            <span className="text-text-primary">XMTP identity and message database</span> — created
            and managed by the XMTP browser SDK in local browser storage so your inbox works across
            sessions.
          </li>
          <li>
            <span className="text-text-primary">Pending ENS registration</span> — a commit/reveal
            registration in progress is held in <Mono>sessionStorage</Mono> and discarded when the
            registration completes or the tab closes.
          </li>
          <li>
            <span className="text-text-primary">Wallet connection state</span> — stored by your
            wallet provider and by WalletConnect/Reown so you stay connected on reload.
          </li>
        </List>
        <p>Clearing your browser data for this site removes all of it.</p>
      </Section>

      <Section heading="5. Third Parties You Contact By Using DMpay">
        <p>
          Because the app runs in your browser, these services receive your IP address and the
          requests your browser makes to them. We do not control their practices.
        </p>
        <List>
          <li><span className="text-text-primary">Ethereum RPC providers</span> — publicnode, Tenderly and OnFinality public endpoints, used to read chain state and event logs.</li>
          <li><span className="text-text-primary">XMTP</span> — encrypted message transport.</li>
          <li><span className="text-text-primary">WalletConnect / Reown</span> — wallet connection infrastructure.</li>
          <li><span className="text-text-primary">Pinata / IPFS</span> — pinning of encrypted attachments.</li>
          <li><span className="text-text-primary">ENS Labs (euc.li)</span> — avatar upload and hosting for ENS profiles.</li>
          <li><span className="text-text-primary">Ethereum Follow Protocol</span> — follower statistics.</li>
          <li><span className="text-text-primary">Google Fonts</span> — webfont delivery.</li>
          <li><span className="text-text-primary">Cloudflare Pages</span> — hosting for {SITE_HOST}, which keeps standard server access logs. See the <A href="https://www.cloudflare.com/privacypolicy/">Cloudflare Privacy Policy</A>.</li>
        </List>
      </Section>

      <Section heading="6. Analytics">
        <p>
          We run no analytics, no tracking pixels, no advertising SDKs, and no session recording. We
          do not build profiles of visitors and we have no data to sell, rent, or share.
        </p>
      </Section>

      <Section heading="7. Retention & Deletion">
        <p>
          Onchain and ENS data is immutable and cannot be deleted — this is a property of public
          blockchains, and you should treat anything you publish through DMpay as permanent. IPFS
          content persists for as long as any node pins it. Local browser data is under your
          control and can be cleared at any time. We hold no copy of any of it, so there is no
          deletion request we are able to act on.
        </p>
      </Section>

      <Section heading="8. Children's Privacy">
        <p>
          DMpay is not directed at anyone under 18 and we do not knowingly facilitate use by minors.
        </p>
      </Section>

      <Section heading="9. Changes">
        <p>
          We may update this policy. Changes are reflected in the "Last updated" date above.
          Continued use after a change constitutes acceptance.
        </p>
      </Section>

      <Section heading="10. Contact">
        <p>
          Questions: <Mono>privacy@dmpay.me</Mono>, or open an issue on{' '}
          <A href="https://github.com/RWA-ID/DMpay-Protocol">GitHub</A>.
        </p>
      </Section>
    </LegalLayout>
  );
}
