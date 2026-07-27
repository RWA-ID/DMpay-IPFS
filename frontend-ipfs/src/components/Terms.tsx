import { LegalLayout, Section, List, A, Mono } from './LegalLayout';
import { SITE_HOST } from '../lib/site';
import { DMPAY_DIRECT_ADDRESS } from '../lib/contracts';

export function Terms() {
  return (
    <LegalLayout title="Terms of Service" updated="July 2026">
      <Section heading="1. Acceptance">
        <p>
          By using the DMpay interface at <Mono>{SITE_HOST}</Mono> ("the Interface") you agree to
          these Terms. If you do not agree, do not use the Interface.
        </p>
        <p>
          DMpay is a set of immutable smart contracts on Ethereum plus an open-source front end that
          runs in your browser. We publish an interface to a public protocol. We are not a broker, an
          exchange, a custodian, a money transmitter, or a party to any transaction between users. We
          never hold, control, or have the ability to move your funds.
        </p>
      </Section>

      <Section heading="2. Eligibility">
        <p>
          You must be at least 18 and legally capable of entering into contracts. You must not use
          the Interface if you are located in, or acting on behalf of anyone located in, a
          jurisdiction subject to comprehensive sanctions, or if you appear on any applicable
          sanctions list. Access from a jurisdiction where the Interface would be unlawful is
          prohibited.
        </p>
      </Section>

      <Section heading="3. What The Protocol Does">
        <List>
          <li>Lets you publish a price, in USDC and/or ETH, for opening a conversation with you.</li>
          <li>Lets another person pay that price — or buy a lifetime pass — to unlock a thread with you.</li>
          <li>Settles payment atomically onchain via the DMpay contract at <Mono>{DMPAY_DIRECT_ADDRESS}</Mono>.</li>
          <li>Carries the messages themselves over XMTP, end-to-end encrypted, including group conversations.</li>
          <li>Optionally registers a <Mono>.eth</Mono> name and writes your ENS profile records.</li>
        </List>
        <p>
          Nothing in the protocol obliges a recipient to read or reply to a message. Paying a price
          buys the ability to deliver a message, not a response, an outcome, or a relationship.
        </p>
      </Section>

      <Section heading="4. Fees">
        <p>
          The contract currently deducts a 2.5% protocol fee at the moment of payment and settles the
          remaining 97.5% directly to the recipient. The fee is enforced by the contract, not by us,
          and the rate in effect is whatever the deployed contract says it is — future contract
          versions may differ. Ethereum gas fees are set by the network, paid by you, and are not
          ours.
        </p>
      </Section>

      <Section heading="5. Finality And Refunds">
        <p>
          Blockchain transactions are irreversible. Once a payment confirms, no one — including us —
          can reverse, cancel, or refund it. Verify the recipient, the amount, and the network in
          your wallet before signing. Payments sent to the wrong address are unrecoverable.
        </p>
      </Section>

      <Section heading="6. Your Responsibilities">
        <List>
          <li>You are solely responsible for your wallet, seed phrase, and private keys. Loss of key means loss of funds and of your inbox; we cannot restore either.</li>
          <li>You are responsible for every transaction you sign.</li>
          <li>You must not use DMpay to spam, harass, threaten, defraud, or distribute unlawful content.</li>
          <li>You must not impersonate any person or entity or misrepresent an affiliation.</li>
          <li>You must not use DMpay for money laundering, sanctions evasion, or any other illegal purpose.</li>
          <li>You are responsible for determining and paying any taxes arising from payments you receive.</li>
        </List>
      </Section>

      <Section heading="7. Messaging And Content">
        <p>
          Messages are end-to-end encrypted and transported by the XMTP network. We cannot read,
          moderate, retrieve, or delete message content, and we do not act as a moderator of
          communications between users. Your use of XMTP is also governed by{' '}
          <A href="https://docs.xmtp.org">XMTP's own terms and documentation</A>. Content you send is
          your responsibility.
        </p>
      </Section>

      <Section heading="8. ENS Names">
        <p>
          DMpay can register <Mono>.eth</Mono> names directly through the ENS ETHRegistrarController
          using a standard commit/reveal flow. You are registering with ENS, not with us: we do not
          own, issue, renew, or control your name, we take no cut of the registration price, and
          registration fees are paid to the ENS protocol. Names expire unless renewed, and it is your
          responsibility to renew them. Name availability, pricing, and resolution are governed by
          ENS.
        </p>
      </Section>

      <Section heading="9. No Warranty">
        <p>
          THE INTERFACE AND THE PROTOCOL ARE PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTY OF
          ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
          AND NON-INFRINGEMENT.
        </p>
        <p>
          We do not warrant that the Interface will be available or error-free, that the smart
          contracts are free of bugs or vulnerabilities, that XMTP will deliver any given message,
          that ENS will resolve as expected, or that third-party infrastructure will remain
          operational. Smart contracts, once deployed, cannot be patched — you use them at your own
          risk.
        </p>
      </Section>

      <Section heading="10. Limitation Of Liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF FUNDS, DATA,
          MESSAGES, ENS NAMES, OR PROFITS, ARISING OUT OF YOUR USE OF THE INTERFACE OR THE PROTOCOL,
          EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
        </p>
      </Section>

      <Section heading="11. Availability Of The Interface">
        <p>
          We may modify or discontinue the hosted interface at any time without notice. The protocol
          is independent of it: the contracts remain onchain and callable, and the front end is
          open-source and also published to IPFS, so anyone can run their own copy. We do not
          guarantee continued operation of any particular domain or gateway.
        </p>
      </Section>

      <Section heading="12. Intellectual Property">
        <p>
          The DMpay front end and contracts are open-source; see{' '}
          <A href="https://github.com/RWA-ID/DMpay-Protocol">the repository</A> for licence terms.
          The DMpay name, logo, and branding remain ours. Deployed contract code is immutable and
          publicly auditable.
        </p>
      </Section>

      <Section heading="13. Changes">
        <p>
          We may revise these Terms. Changes are reflected in the "Last updated" date above.
          Continued use after a change constitutes acceptance; if you disagree, stop using the
          Interface.
        </p>
      </Section>

      <Section heading="14. Governing Law">
        <p>
          These Terms are governed by applicable law, and disputes shall be resolved through binding
          arbitration to the extent permitted by law. Nothing here waives any right you cannot waive
          under the law of your jurisdiction.
        </p>
      </Section>

      <Section heading="15. Contact">
        <p>
          Questions: <Mono>legal@dmpay.me</Mono>, or open an issue on{' '}
          <A href="https://github.com/RWA-ID/DMpay-Protocol">GitHub</A>.
        </p>
      </Section>
    </LegalLayout>
  );
}
