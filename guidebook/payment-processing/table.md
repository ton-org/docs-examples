# Choosing a Deposit Approach

## Quick Comparison

| Question                             | Single Wallet             | Multi-Wallet                   |
|--------------------------------------|---------------------------|--------------------------------|
| Do users need to add a comment/memo? | ✅ Yes (UUID required)     | ❌ No                           |
| How many wallets do you manage?      | 1                         | 1 per user + 1 HOT wallet      |
| What do you monitor?                 | One wallet's transactions | Entire blockchain (via blocks) |
| API requirements                     | Standard TON API          | Standard + Index API           |
| Setup complexity                     | ⭐ Simple                  | ⭐⭐⭐ Complex                    |
| Infrastructure cost                  | 💰 Low                    | 💰💰 Medium                    |
| Transaction costs                    | Lower (1 tx per deposit)  | Higher (deposit + forward)     |
| User experience                      | Need to add memo          | Just send to address           |
| Best for beginners?                  | ✅ Yes                     | ❌ No                           |

## Use Case Decision Tree

```
Need to accept TON deposits?
│
├─ Users CAN add comments/memos?
│  └─ YES → Use Single Wallet Approach
│     Examples: Payment processors, Donation platforms, Simple checkouts
│
└─ Users CANNOT add comments/memos?
   └─ YES → Use Multi-Wallet Approach
      Examples: Exchanges, Trading platforms, Mobile wallets
```

## Single Wallet Approach

### ✅ Choose This When:
- Building a payment processor or checkout
- Users can copy/paste or scan QR codes with comments
- You want simplest possible setup
- Budget is limited
- First time implementing TON payments
- Handling moderate transaction volume

### ❌ Don't Choose This When:
- Users send from exchange wallets (can't add memos)
- Mobile-first app where adding memos is difficult
- Need highest reliability (comments can be missing)
- Building an exchange or trading platform

### Example Services:
- E-commerce checkout
- Donation platforms
- Subscription services
- Invoice payments
- Crowdfunding platforms

## Multi-Wallet Approach

### ✅ Choose This When:
- Building a cryptocurrency exchange
- Users might send from exchanges (no memo support)
- Need maximum reliability
- Each user needs a permanent deposit address
- Have infrastructure to run block monitoring
- High transaction volume expected

### ❌ Don't Choose This When:
- Just starting out (use single wallet first)
- Limited budget (more infrastructure needed)
- Simple use case (overkill)
- Don't want to manage many private keys

### Example Services:
- Cryptocurrency exchanges
- Trading platforms  
- Custodial wallets
- OTC desks
- Payment gateways for exchanges

## Technical Comparison

### Single Wallet

**Architecture:**
```
User → [Send TON + UUID] → Your Wallet → Your Backend
                                              ↓
                                    Match UUID in DB → Credit User
```

**Infrastructure:**
- TON API client
- Database for UUIDs
- Transaction poller

**Code Complexity:** ⭐ Low

**Example Files:**
- `deposits.ts` - Full implementation
- `simple-example.ts` - Minimal example

### Multi-Wallet

**Architecture:**
```
User → [Send TON] → User's Deposit Wallet → Auto-forward → HOT Wallet
                                                                ↓
                                                          Your Backend
                                                                ↓
                                                    Monitor blocks → Credit User
```

**Infrastructure:**
- TON API client
- Index API access
- Database for wallet keys
- Block monitor
- Transaction forwarder

**Code Complexity:** ⭐⭐⭐ High

**Example Files:**
- `deposits-multi-wallet.ts` - Full implementation
- `simple-multi-wallet.ts` - Minimal example

## Cost Analysis

### Single Wallet

**Setup Costs:**
- None (just deploy backend)

**Per Transaction:**
- No blockchain fees (user pays)
- API calls: ~2-3 per transaction check

**Monthly Infrastructure:**
- Backend server: $5-20
- Database: $5-10
- Total: ~$10-30/month

### Multi-Wallet

**Setup Costs:**
- Index API setup
- More complex backend

**Per Transaction:**
- Deposit: User pays
- Forward to HOT: ~0.01 TON ($0.02-0.05)
- API calls: ~5-10 per transaction

**Monthly Infrastructure:**
- Backend server: $20-50
- Database: $10-20
- Index API: $0-50 (depends on provider)
- Total: ~$30-120/month

**Transaction Cost Example:**
- 1000 deposits/month
- Forwarding cost: ~10 TON (~$20-50)
- Total monthly: ~$50-170

## Migration Path

### Start Simple, Scale Up

1. **Phase 1:** Start with Single Wallet
   - Implement basic deposit processing
   - Get users and revenue flowing
   - Learn TON blockchain

2. **Phase 2:** Add Multi-Wallet Option
   - Offer both methods
   - Let users choose
   - Test multi-wallet with subset of users

3. **Phase 3:** Migrate to Multi-Wallet
   - Once infrastructure is proven
   - Migrate users gradually
   - Keep single wallet as fallback

### Code Reusability

Both approaches share:
- TON client setup
- Transaction validation logic
- Database operations
- User account management

Only differs in:
- How you monitor (poll wallet vs monitor blocks)
- Where deposits go (one wallet vs many)
- Forwarding logic (not needed vs required)

## Security Considerations

### Single Wallet
- ✅ One wallet to secure
- ✅ Simpler key management
- ⚠️ Single point of failure
- ⚠️ Comment validation required

### Multi-Wallet
- ⚠️ Many private keys to secure
- ⚠️ HOT wallet security critical
- ✅ Isolated user wallets
- ✅ No comment validation needed

## Recommendations

### For Beginners
**Start with:** Single Wallet
**Why:** Learn TON with minimal complexity

### For Startups
**Start with:** Single Wallet
**Migrate to:** Multi-Wallet when volume grows

### For Exchanges
**Use:** Multi-Wallet from day one
**Why:** Users expect deposit addresses

### For Merchants
**Use:** Single Wallet
**Why:** Checkout flows work well with memos

### For Wallets
**Use:** Multi-Wallet
**Why:** Each user needs their own address

## Getting Started

### Single Wallet
```bash
npm run start:simple    # Try the simple example first
npm start              # Then try the full version
```

### Multi-Wallet
```bash
npm run start:simple-multi    # Try the simple example first
npm run start:multi          # Then try the full version
```

## Need Help?

- Start with `simple-example.ts` or `simple-multi-wallet.ts`
- Read the inline code comments
- Check the main README.md
- Test on testnet first
- Join TON developer community

## Summary

**TL;DR:**
- 🎯 **Most users:** Start with Single Wallet
- 💱 **Exchanges:** Use Multi-Wallet
- 🚀 **Scaling up:** Migrate from Single to Multi
- 📚 **Learning:** Try both approaches

Both approaches are production-ready. Choose based on your specific needs, not theoretical "best practices."
