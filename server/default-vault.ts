export interface SeedFile {
  path: string;
  content: string;
}

export const SEED_NOTES: SeedFile[] = [
  {
    path: 'index.md',
    content: `---
title: "EMV Chip & Contactless Payment Specifications Research Vault"
tags:
  - emv
  - payment-specs
  - index
  - cryptography
status: active
spec_version: "EMV 4.3 / Book 1-4"
aliases:
  - "EMV Index"
  - "Catalog"
  - "Home"
updated: "2026-08-30"
---

# EMV Chip & Contactless Payment Specifications Research

Welcome to the **EMV Research Vault**. This knowledge base contains consolidated technical notes, APDU protocol sequences, cryptographic algorithms, tag catalogs (BER-TLV), and kernel execution pathways derived from the official EMVCo specifications.

## 📚 Core Specification Books

- [[EMV Book 1 - Architecture & Mechanics]] — Physical interfaces, Answer To Reset (ATR), and Application Selection (PSE / PPSE)
- [[EMV Book 2 - Security & Cryptography]] — Static & Dynamic Data Authentication ([[SDA vs DDA vs CDA]]), RSA public keys, and symmetric Triple-DES/AES session keys
- [[EMV Book 3 - Application Protocol & APDUs]] — Command APDUs, GPO, READ RECORD, GET PROCESSING OPTIONS, and GENERATE AC
- [[EMV Book 4 - Cardholder Verification & Terminal Management]] — [[Cardholder Verification Method List]] (CVM codes, PINs, CDCVM) and Terminal Action Codes (TAC/IAC)

## ⚡ Specialized Topics & Deep Dives

- [[SDA vs DDA vs CDA]] — Detailed cryptographic comparison of offline card authentication methods
- [[Cardholder Verification Method List]] — Rule evaluation engine, condition codes, and fallback logic
- [[Tag Catalog - TLV Format]] — Comprehensive dictionary of BER-TLV tags (Tag \`9F26\`, \`82\`, \`94\`, \`9F36\`, \`9F37\`, etc.)
- [[APDU Error Codes & Status Words]] — Complete SW1/SW2 status dictionary (\`9000\`, \`6A82\`, \`6985\`, \`63CX\`)
- [[Contactless Kernel Specs]] — Overview of EMV Contactless Kernels (Kernel 1-7, PPSE \`2PAY.SYS\`)

## 🧭 Transaction Execution Pathway

Every EMV Contact transaction follows a strict 8-step pipeline:

1. **Candidate List Creation & Selection**: Terminal sends \`SELECT PSE\` (\`1PAY.SYS.DDF01\`) or matching AID. See [[EMV Book 1 - Architecture & Mechanics]].
2. **Initiate Application Processing (GPO)**: Terminal sends \`GET PROCESSING OPTIONS\` with PDOL data to retrieve the Application Interchange Profile (\`AIP\` Tag \`82\`) and Application File Locator (\`AFL\` Tag \`94\`).
3. **Read Application Data**: Terminal issues \`READ RECORD\` commands for all records defined in the AFL. See [[EMV Book 3 - Application Protocol & APDUs]].
4. **Offline Data Authentication**: Terminal verifies card authenticity using [[SDA vs DDA vs CDA]].
5. **Processing Restrictions**: Check Application Effective/Expiration Dates (Tag \`5F25\` / \`5F24\`) and Application Usage Control (\`AUC\` Tag \`9F07\`).
6. **Cardholder Verification**: Terminal processes the [[Cardholder Verification Method List]] (Offline PIN, Online PIN, CDCVM, Signature).
7. **Terminal Risk Management**: Floor limits, random transaction selection, and velocity checks.
8. **First & Second Action Analysis**: Terminal requests Application Cryptogram (\`ARQC\`, \`TC\`, or \`AAC\`) via \`GENERATE AC\`.

---

## 🏷️ Tag Index
- #emv — General EMV Architecture
- #cryptography — Cryptographic algorithms (RSA, 3DES, AES, SHA-1/256)
- #apdu — Smartcard APDU commands and responses
- #cvm — Cardholder verification mechanisms
- #tlv — BER-TLV data structures
`
  },
  {
    path: 'EMV Architecture/EMV Book 1 - Architecture & Mechanics.md',
    content: `---
title: "EMV Book 1 - Architecture, Electrical & Application Selection"
tags:
  - emv
  - architecture
  - atr
  - apdu
spec_version: "EMV 4.3 Book 1"
status: complete
aliases:
  - "Book 1"
  - "EMV Book 1"
  - "Application Selection"
---

# EMV Book 1: Architecture & Application Selection

EMV Book 1 defines the electrical signals, operating voltages (Class A: 5V, Class B: 3V, Class C: 1.8V), Answer to Reset (ATR) protocols (T=0 and T=1), and the logical selection of payment applications on the chip card.

## 🔌 Answer To Reset (ATR)

Upon power-up and reset (RST pin falling to rising transition), the ICC transmits an ATR string over the I/O line complying with ISO/IEC 7816-3.

### ATR Structure
- **TS**: Initial Character (\`3B\` for direct convention, \`3F\` for inverse convention)
- **T0**: Format byte (specifies presence of interface bytes TA1..TD1 and number of historical bytes K)
- **TA1 to TD1**: Transmission parameters (baud rate divisor Di, clock frequency Fi)
- **Historical Bytes**: Card manufacturer proprietary data
- **TCK**: Checksum byte (mandatory for T=1, omitted for T=0)

## 📋 Application Selection Process

Application selection builds a list of mutually supported applications between the terminal and the ICC:

\`\`\`
Terminal                             ICC (Smartcard)
   |                                       |
   |---- SELECT '1PAY.SYS.DDF01' (PSE) --->|
   |<--- FCI Template (Tag '6F' / 'A5') ---|
   |                                       |
   |---- READ RECORD (SFI 1, Rec 1..) ---->|
   |<--- Directory Entry (AID, Label) -----|
\`\`\`

### 1. Payment System Environment (PSE / PPSE)
- **Contact Selection**: Terminal selects PSE with filename \`1PAY.SYS.DDF01\`.
- **Contactless Selection**: Terminal selects Proximity Payment System Environment (PPSE) with filename \`2PAY.SYS.DDF01\`. See [[Contactless Kernel Specs]].

### 2. Direct AID Selection
If PSE is not supported or returns \`6A82\` (File Not Found - see [[APDU Error Codes & Status Words]]), the terminal loops through its configured Terminal Application Table and tries direct \`SELECT\` by Application Identifier (\`AID\`, Tag \`84\` or \`4F\`).

### AID Structure (ISO/IEC 7816-5)
An AID consists of:
- **RID (5 bytes)**: Registered Application Provider Identifier (e.g. \`A000000003\` = Visa, \`A000000004\` = Mastercard, \`A000000025\` = Amex)
- **PIX (up to 11 bytes)**: Proprietary Application Identifier Extension (e.g. \`1010\` = Visa Credit, \`2010\` = Visa Debit)

Next step in transaction flow: [[EMV Book 3 - Application Protocol & APDUs#Initiate Application Processing (GPO)]].
`
  },
  {
    path: 'EMV Architecture/EMV Book 2 - Security & Cryptography.md',
    content: `---
title: "EMV Book 2 - Security & Cryptography"
tags:
  - emv
  - cryptography
  - security
  - rsa
  - session-keys
spec_version: "EMV 4.3 Book 2"
status: active
aliases:
  - "Book 2"
  - "EMV Book 2"
  - "EMV Cryptography"
---

# EMV Book 2: Security & Cryptography

EMV Book 2 governs the mathematical and cryptographic underpinnings of EMV payments, including asymmetric RSA public-key infrastructure for offline authentication, and symmetric Triple-DES / AES cryptography for online cryptograms and PIN encipherment.

## 🔐 Offline Data Authentication (ODA)

ODA proves to an offline or online terminal that the chip card is authentic and issued by a legitimate payment scheme member.

Three distinct authentication schemes are defined:
1. **Static Data Authentication (SDA)**: Signature over static card records. Vulnerable to card cloning if keys are static.
2. **Dynamic Data Authentication (DDA)**: Challenge-response using card-generated dynamic RSA signatures (\`INTERNAL AUTHENTICATE\`).
3. **Combined DDA / AC Generation (CDA)**: Seamlessly combines DDA signature verification into the \`GENERATE AC\` step to prevent man-in-the-middle terminal exploits.

> [!NOTE]
> Read the complete comparison matrix in [[SDA vs DDA vs CDA]].

## 🏛️ Public Key Hierarchy

\`\`\`
[ Payment Scheme CA Root Key ] (e.g., Visa / Mastercard Root RSA 2048)
              │
              ▼
[ Issuer Public Key Certificate ] (Signed by Scheme CA)
              │
              ▼
[ ICC Public Key Certificate ] (Signed by Issuer CA)
              │
              ▼
[ Dynamic Signature Generation ] (Signed by ICC Private Key during DDA/CDA)
\`\`\`

## 🔑 Symmetric Cryptography & Cryptograms

For online authorization, the card generates an **Application Cryptogram (AC)** using a 16-byte Triple-DES (or 128-bit AES) session key derived from the Master Derivation Key (\`MDK\` / \`MK_AC\`) and the Application Transaction Counter (\`ATC\`, Tag \`9F36\`).

### Cryptogram Types
- **ARQC (Authorization Request Cryptogram)**: Sent to issuer host for online authorization (Tag \`9F27\` CID = \`0x80\`).
- **TC (Transaction Certificate)**: Generated when transaction is approved offline or host authorizes without counter-request (CID = \`0x40\`).
- **AAC (Application Authentication Cryptogram)**: Generated when transaction is declined by card or host (CID = \`0x00\`).
- **AAR (Application Authorization Referral)**: Referral required (rarely used, CID = \`0x01\`).

Relevant command: \`GENERATE AC\` described in [[EMV Book 3 - Application Protocol & APDUs]].
`
  },
  {
    path: 'EMV Architecture/EMV Book 3 - Application Protocol & APDUs.md',
    content: `---
title: "EMV Book 3 - Application Protocol & APDUs"
tags:
  - emv
  - apdu
  - protocol
  - smartcard
spec_version: "EMV 4.3 Book 3"
status: complete
aliases:
  - "Book 3"
  - "EMV Book 3"
  - "APDU Commands"
---

# EMV Book 3: Application Protocol & APDUs

Book 3 defines the APDU (Application Protocol Data Unit) messaging protocol between the EMV terminal (reader) and the chip card (ICC).

## 📦 APDU Command Structure (ISO 7816-4)

Every command APDU consists of a 4-byte header and optional body:

| Field | Size | Description | Example (\`SELECT\`) |
|-------|------|-------------|-------------------|
| **CLA** | 1 byte | Class byte (\`0x00\` standard, \`0x80\` proprietary) | \`00\` |
| **INS** | 1 byte | Instruction code | \`A4\` (\`SELECT\`) |
| **P1** | 1 byte | Parameter 1 | \`04\` (Select by DF name) |
| **P2** | 1 byte | Parameter 2 | \`00\` (First or only occurrence) |
| **Lc** | 1 byte | Length of command data | \`07\` |
| **Data**| Lc bytes | Command payload bytes | \`A0000000031010\` |
| **Le** | 1 byte | Expected response length (\`00\` for max) | \`00\` |

## 🛠️ Essential EMV APDU Command Set

### 1. \`SELECT\` (\`00 A4\`)
Selects PSE, PPSE, or specific application AID.
- Response contains FCI Template (Tag \`6F\`) including Application Label (\`50\`), PDOL (\`9F38\`), and DF Name (\`84\`).

### 2. \`GET PROCESSING OPTIONS\` (GPO, \`80 A8\`)
Transmits terminal data requested in Processing Options Data Object List (\`PDOL\`) and receives:
- **AIP (Application Interchange Profile, Tag \`82\`)**: 2 bytes indicating supported functions (SDA, DDA, CDA, Cardholder verification, Terminal risk management).
- **AFL (Application File Locator, Tag \`94\`)**: List of Short File Identifiers (SFI) and record indices to read.

### 3. \`READ RECORD\` (\`00 B2\`)
Reads records pointed to by the AFL. Returns signed static records, PAN (\`5A\`), Expiry (\`5F24\`), [[Cardholder Verification Method List]] (Tag \`8E\`), and CDOLs.

### 4. \`VERIFY\` (\`00 20\`)
Submits Plaintext or Enciphered Offline PIN for verification by the card.
- Response \`9000\` = PIN OK
- Response \`63CX\` = PIN Incorrect, X attempts remaining (see [[APDU Error Codes & Status Words]])

### 5. \`GENERATE AC\` (\`80 AE\`)
Requests an Application Cryptogram (\`ARQC\`, \`TC\`, \`AAC\`). The terminal supplies data requested in Card Risk Management Data Object List 1 (\`CDOL1\`, Tag \`8C\`).

For tag details, see [[Tag Catalog - TLV Format]].
`
  },
  {
    path: 'EMV Architecture/EMV Book 4 - Cardholder Verification & Terminal Management.md',
    content: `---
title: "EMV Book 4 - Cardholder Verification & Terminal Management"
tags:
  - emv
  - cvm
  - terminal-management
  - tac-iac
spec_version: "EMV 4.3 Book 4"
status: complete
aliases:
  - "Book 4"
  - "EMV Book 4"
  - "Terminal Management"
---

# EMV Book 4: Cardholder Verification & Terminal Management

Book 4 specifies how terminals execute Cardholder Verification, maintain Terminal Verification Results (\`TVR\`, Tag \`95\`), and execute Terminal Action Analysis using Terminal Action Codes (\`TAC\`) and Issuer Action Codes (\`IAC\`).

## 👥 Cardholder Verification Method (CVM) Execution

The card provides a priority-ordered list of CVM rules in Tag \`8E\` (CVM List). The terminal iterates through the rules until one successfully completes.

Key CVM methods:
- **Offline Plaintext PIN**: PIN entered into PIN pad, transmitted in plaintext to chip over secure contacts.
- **Offline Enciphered PIN**: PIN encrypted under ICC Public Key before sending to chip.
- **Online PIN**: Encrypted PIN block sent in ISO 8583 message to issuer host.
- **Signature**: Paper receipt or digital stylus signature.
- **Consumer Device Cardholder Verification Method (CDCVM)**: Biometric/passcode on smartphone (Apple Pay / Google Wallet).
- **No CVM**: Contactless low-value transactions below CVM threshold limit.

> [!TIP]
> Inspect the byte-level breakdown in [[Cardholder Verification Method List]].

## 🚦 Terminal Action Codes (TAC) vs Issuer Action Codes (IAC)

During Action Analysis, the terminal evaluates bits in the TVR (\`95\`) against three pairs of action codes:

| Action Level | Terminal Action Code (Terminal Config) | Issuer Action Code (Card Tag in AFL) | Outcome if Matched |
|--------------|--------------------------------------|--------------------------------------|-------------------|
| **Denial** | \`TAC-Denial\` | \`IAC-Denial\` (Tag \`9F0E\`) | Immediate offline decline (\`AAC\`) |
| **Online** | \`TAC-Online\` | \`IAC-Online\` (Tag \`9F0F\`) | Request online host authorization (\`ARQC\`) |
| **Default** | \`TAC-Default\`| \`IAC-Default\` (Tag \`9F0D\`)| Action if terminal is unable to go online |

Linked documents: [[EMV Book 2 - Security & Cryptography]], [[Tag Catalog - TLV Format]].
`
  },
  {
    path: 'Cryptography/SDA vs DDA vs CDA.md',
    content: `---
title: "SDA vs DDA vs CDA - Comparative Cryptographic Analysis"
tags:
  - cryptography
  - emv
  - security
  - rsa
  - dda
  - cda
status: complete
aliases:
  - "Offline Data Authentication"
  - "ODA"
  - "DDA vs CDA"
---

# SDA vs DDA vs CDA: Offline Data Authentication Comparison

Offline Data Authentication (ODA) validates the authenticity of the chip card without needing an active real-time connection to the card issuer.

## 📊 Comparison Matrix

| Feature | Static Data Authentication (SDA) | Dynamic Data Authentication (DDA) | Combined DDA/AC (CDA) |
| :--- | :--- | :--- | :--- |
| **Standard Book** | [[EMV Book 2 - Security & Cryptography]] | [[EMV Book 2 - Security & Cryptography]] | [[EMV Book 2 - Security & Cryptography]] |
| **Card Key Requirements** | Issuer Public Key only | Card RSA Coprocessor + ICC Private Key | Card RSA Coprocessor + ICC Private Key |
| **APDU Commands Used** | \`READ RECORD\` only | \`INTERNAL AUTHENTICATE\` | Piggybacked on \`GENERATE AC\` |
| **Terminal Challenge** | None (Static hash) | 4-byte Unpredictable Number (\`9F37\`) | Terminal Unpredictable Number + CDOL |
| **Protection Against Cloning** | ❌ None (Replay attack possible) | ✅ Complete for card | ✅ Complete for card & transaction |
| **Protection Against MITM Wedge**| ❌ Weak | ⚠️ Weak (Wedge can alter 2nd Gen AC) | ✅ Complete (Signed dynamic cryptogram) |
| **Execution Overhead** | Very Fast (<20ms) | Moderate (~80-150ms) | Optimized (~60-100ms) |

## 1. Static Data Authentication (SDA)
The card stores a Signed Static Application Data (SSAD, Tag \`93\`) generated by the Issuer's private key over critical tags like PAN (\`5A\`) and AIP (\`82\`).
- Terminal verifies signature using Issuer Public Key.
- **Flaw**: Because the signature is static, a rogue terminal could record the data and clone it onto a counterfeit card (Replay). Deprecated in modern EMV profiles.

## 2. Dynamic Data Authentication (DDA)
Terminal sends an \`INTERNAL AUTHENTICATE\` APDU containing an Unpredictable Number (UN, Tag \`9F37\`).
- The smartcard hashes the UN + Dynamic data and signs it using its internal **ICC Private Key**.
- Terminal verifies the signature using the card's certified ICC Public Key.
- Proves the card physically possesses the tamper-proof private key.

## 3. Combined DDA / Application Cryptogram (CDA)
CDA solves the "Man-in-the-Middle Wedge Attack" where a malicious shim intercepts communication between a genuine chip and the POS.
- Instead of a separate \`INTERNAL AUTHENTICATE\`, the signature is combined directly into the response of \`GENERATE AC\` (see [[EMV Book 3 - Application Protocol & APDUs]]).
- The card generates the cryptogram (\`ARQC\` or \`TC\`) and cryptographically signs both the transaction data and the cryptogram in one unified block.

Refer to [[Tag Catalog - TLV Format]] for Tag \`9F4B\` (Signed Dynamic Application Data).
`
  },
  {
    path: 'CVM/Cardholder Verification Method List.md',
    content: `---
title: "Cardholder Verification Method (CVM) List Specification"
tags:
  - emv
  - cvm
  - security
  - pin
spec_version: "EMV 4.3 Book 4 Section 10.5"
status: complete
aliases:
  - "CVM List"
  - "CVM Codes"
  - "Cardholder Verification"
---

# Cardholder Verification Method (CVM) List

The CVM List (Tag \`8E\`) is returned in \`READ RECORD\` and defines the rules evaluated by the terminal to verify that the person presenting the card is the legitimate cardholder.

## 📐 CVM List Data Structure

A CVM List contains:
1. **Amount X (4 bytes)**: Threshold amount 1 (in transaction currency)
2. **Amount Y (4 bytes)**: Threshold amount 2
3. **CVM Rules (2 bytes per rule)**:
   - Byte 1: CVM Code & Fail behavior
   - Byte 2: Condition Code

\`\`\`
+-------------------+-------------------+-------------------------+
| Amount X (4 bytes)| Amount Y (4 bytes)| Rule 1 | Rule 2 | ...   |
+-------------------+-------------------+-------------------------+
\`\`\`

## 🔢 CVM Code Byte Breakdown (Byte 1)

- **Bit 7 (Fail Behavior)**:
  - \`0\` = If this CVM fails, terminate CVM processing and fail cardholder verification.
  - \`1\` = If this CVM fails, proceed to next rule in CVM list.
- **Bits 6-1 (CVM Method)**:
  - \`000000\` (\`0x00\`) = Fail CVM processing
  - \`000001\` (\`0x01\`) = Plaintext Offline PIN
  - \`000010\` (\`0x02\`) = Enciphered PIN verified Online
  - \`000011\` (\`0x03\`) = Plaintext Offline PIN and Signature
  - \`000100\` (\`0x04\`) = Enciphered Offline PIN
  - \`000101\` (\`0x05\`) = Enciphered Offline PIN and Signature
  - \`011110\` (\`0x1E\`) = Signature (paper/stylus)
  - \`011111\` (\`0x1F\`) = No CVM required
  - \`100001\` (\`0x21\`) = Consumer Device CVM (CDCVM / Biometrics)

## ⚖️ Condition Code Byte Breakdown (Byte 2)

- \`0x00\` = Always
- \`0x01\` = If unattended cash (ATM)
- \`0x02\` = If not unattended cash, not manual cash, not purchase with cashback
- \`0x03\` = If terminal supports this CVM
- \`0x04\` = If manual cash
- \`0x05\` = If purchase with cashback
- \`0x06\` = If transaction in application currency and under Amount X
- \`0x07\` = If transaction in application currency and over Amount X
- \`0x08\` = If transaction in application currency and under Amount Y
- \`0x09\` = If transaction in application currency and over Amount Y

See practical APDU interactions in [[EMV Book 3 - Application Protocol & APDUs]] and [[EMV Book 4 - Cardholder Verification & Terminal Management]].
`
  },
  {
    path: 'Data Elements/Tag Catalog - TLV Format.md',
    content: `---
title: "Tag Catalog - BER-TLV Data Elements Dictionary"
tags:
  - emv
  - tlv
  - data-elements
  - tags
spec_version: "EMV 4.3 Book 3 Annex B"
status: complete
aliases:
  - "TLV Catalog"
  - "EMV Tags"
  - "BER-TLV"
---

# Tag Catalog: BER-TLV Data Elements Dictionary

EMV encodes all data structures using ASN.1 BER-TLV (Basic Encoding Rules — Tag, Length, Value).

## 🧱 BER-TLV Tag Encoding Rules

- **Tag Class** (Bits 8-7 of First Byte):
  - \`00\` = Universal
  - \`01\` = Application
  - \`10\` = Context-specific
  - \`11\` = Private
- **Tag Type** (Bit 6):
  - \`0\` = Primitive (contains raw data value)
  - \`1\` = Constructed (contains nested TLV objects)
- **Multi-byte Tag**: If bits 5-1 are all \`11111\` (\`0x1F\`), the tag spans multiple bytes.

## 📖 Key EMV Tags Reference Table

| Tag | Name | Format | Source | Description |
| :--- | :--- | :--- | :--- | :--- |
| **\`4F\`** | Application Identifier (AID) | \`b\` 5-16 | ICC | Identifies card application |
| **\`50\`** | Application Label | \`ans\` 1-16 | ICC | User-readable name (e.g. "Visa Credit") |
| **\`5A\`** | Application PAN | \`cn\` up to 10 | ICC | Primary Account Number (card number) |
| **\`5F24\`**| Application Expiration Date | \`n 6\` (YYMMDD) | ICC | Card expiration date |
| **\`5F2A\`**| Transaction Currency Code | \`n 3\` | Terminal | ISO 4217 numeric (e.g. \`0840\` for USD) |
| **\`82\`** | Application Interchange Profile (AIP) | \`b 2\` | ICC | Capabilities returned from GPO |
| **\`84\`** | Dedicated File (DF) Name | \`b\` 5-16 | ICC | Selected AID |
| **\`8C\`** | CDOL 1 | \`b\` var | ICC | List of tags required by \`GENERATE AC\` |
| **\`8E\`** | [[Cardholder Verification Method List]] | \`b\` var | ICC | Prioritized CVM rules |
| **\`94\`** | Application File Locator (AFL) | \`b\` var | ICC | Files and records to read |
| **\`95\`** | Terminal Verification Results (TVR) | \`b 5\` | Terminal | Bitfield of checks performed |
| **\`9F02\`**| Amount, Authorized (Numeric) | \`n 12\` | Terminal | Transaction amount |
| **\`9F26\`**| Application Cryptogram (AC) | \`b 8\` | ICC | 8-byte ARQC / TC / AAC |
| **\`9F27\`**| Cryptogram Information Data (CID) | \`b 1\` | ICC | Indicates cryptogram type and advice |
| **\`9F36\`**| Application Transaction Counter (ATC) | \`b 2\` | ICC | Increments on every transaction |
| **\`9F37\`**| Unpredictable Number (UN) | \`b 4\` | Terminal | Random nonce generated for security |

Related: [[EMV Book 3 - Application Protocol & APDUs]] and [[SDA vs DDA vs CDA]].
`
  },
  {
    path: 'Troubleshooting/APDU Error Codes & Status Words.md',
    content: `---
title: "APDU Error Codes & Status Words (SW1 SW2)"
tags:
  - apdu
  - troubleshooting
  - status-words
  - iso7816
status: complete
aliases:
  - "Status Words"
  - "SW1 SW2"
  - "APDU Errors"
---

# APDU Error Codes & Status Words Reference (SW1 SW2)

When an APDU command is processed by a smartcard chip, the last two bytes returned in the response are Status Word 1 (\`SW1\`) and Status Word 2 (\`SW2\`).

## 🟢 Success Statuses

| SW1 | SW2 | Meaning | Action Needed |
|:---|:---|:---|:---|
| \`90\` | \`00\` | **Success / Normal processing** | Proceed to next transaction step. |
| \`61\` | \`XX\` | **Response bytes available** | Terminal must issue \`GET RESPONSE\` with \`Le = XX\`. |

## 🔴 Common Error Status Codes

| SW1 | SW2 | Meaning | Typical Cause |
|:---|:---|:---|:---|
| \`63\` | \`CX\` | **PIN Verification Failed** | Offline PIN was incorrect; \`X\` attempts remaining before card locks. |
| \`63\` | \`00\` | **Authentication Failed** | \`INTERNAL AUTHENTICATE\` failed. |
| \`67\` | \`00\` | **Wrong Length (Lc/Le)** | Incorrect length specified in command header. |
| \`69\` | \`82\` | **Security Status Not Satisfied** | PIN blocked or authentication prerequisite not performed. |
| \`69\` | \`85\` | **Conditions of Use Not Satisfied** | Command issued out of sequence (e.g. \`READ RECORD\` before \`GPO\`). |
| \`6A\` | \`81\` | **Function Not Supported** | Card application does not support instruction. |
| \`6A\` | \`82\` | **File / Application Not Found** | AID or PSE is not installed on this ICC. |
| \`6A\` | \`83\` | **Record Not Found** | \`READ RECORD\` called for non-existent SFI/record index. |
| \`6A\` | \`86\` | **Incorrect Parameters (P1-P2)** | Invalid command parameters. |
| \`6D\` | \`00\` | **Instruction Code Not Supported (INS)** | Invalid INS byte. |
| \`6E\` | \`00\` | **Class Not Supported (CLA)** | Invalid CLA byte. |

## 🔍 Diagnostic Decision Flow
\`\`\`
            [ APDU Response ]
                   │
         Is SW1 SW2 == 90 00?
             /            \\
           Yes             No
          /                 \\
[ Proceed ]           Is SW1 == 61?
                     /             \\
                   Yes              No
                  /                  \\
      [ Issue GET RESPONSE ]    Is SW1 == 63 and SW2 == CX?
                               /              \\
                             Yes               No
                            /                   \\
           [ Prompt Retry PIN ]          [ Check Table & Terminate ]
\`\`\`

Cross reference: [[EMV Book 3 - Application Protocol & APDUs]] and [[Cardholder Verification Method List]].
`
  },
  {
    path: 'Payment Protocols/Contactless Kernel Specs.md',
    content: `---
title: "Contactless Kernel Specifications & PPSE Architecture"
tags:
  - emv
  - contactless
  - kernels
  - ppse
  - nfc
spec_version: "EMV Contactless Book C-1 to C-7"
status: active
aliases:
  - "Contactless Kernels"
  - "PPSE"
  - "Kernel Specs"
---

# Contactless Kernel Specifications & PPSE Architecture

Unlike contact EMV which follows a unified Book 1-4 standard, Contactless EMV (NFC ISO/IEC 14443) uses specialized **Kernels** maintained by payment schemes and standardized under EMVCo Book C-1 through C-7.

## 📡 The 7 EMVCo Contactless Kernels

| Kernel ID | Payment Scheme / Standard | Brand Name | Features |
|:---|:---|:---|:---|
| **Kernel 1** | JCB / EMVCo Baseline | J/Smart | Base contact-over-contactless |
| **Kernel 2** | Mastercard | PayPass / M/Chip Contactless | Torn transaction recovery, Data Storage (DS) |
| **Kernel 3** | Visa | payWave / VCPS | Fast dynamic DDA (qVSDC), MSD fallback |
| **Kernel 4** | American Express | ExpressPay | Enhanced ExpressPay 3.0 |
| **Kernel 5** | JCB | J/Speedy | High speed transit support |
| **Kernel 6** | Discover / Diners | D-PAS Contactless | Zip & D-PAS modes |
| **Kernel 7** | UnionPay | QuickPass | Dual interface PBOC 3.0 |

## ⚡ PPSE Entry Point (2PAY.SYS.DDF01)

Contactless transactions require speed (<400ms target tapping latency). The terminal initiates selection via the **Proximity Payment System Environment**:

\`\`\`
Terminal                             NFC Device / Contactless Card
   |                                              |
   |---- SELECT '2PAY.SYS.DDF01' (PPSE) --------->|
   |<--- FCI Template with list of Priority AIDs -|
   |                                              |
   |---- SELECT Preferred AID (e.g. Visa) ------->|
   |---- GPO with fast PDOL --------------------->|
   |<--- Cryptogram directly in GPO response ----|
\`\`\`

In optimized kernels (such as Visa qVSDC or Mastercard M/Chip Advance), the \`GPO\` response delivers the cryptogram and CDA signature in one step without needing separate \`READ RECORD\` or \`GENERATE AC\` calls!

Related notes: [[EMV Book 1 - Architecture & Mechanics]], [[SDA vs DDA vs CDA]], [[Tag Catalog - TLV Format]].
`
  }
];
