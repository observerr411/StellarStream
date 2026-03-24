## **feat(frontend): Nebula V2 Multi-Contract Provider Setup**

### **Overview**

This PR implements #417 by refactoring the frontend's Soroban provider to handle dual-contract IDs, enabling the application to interact with both V1 (Legacy) and V2 (Nebula) StellarStream contracts simultaneously.

---

### **Changes**

#### **New Files**

| File | Description |
|------|-------------|
| `frontend/lib/providers/StellarProvider.tsx` | Main provider with dual-contract support including contract instances, balance management, and custom hooks |
| `frontend/lib/providers/index.ts` | Barrel export file for clean imports |
| `frontend/.env.example` | Environment configuration template documenting required variables |

#### **Modified Files**

| File | Changes |
|------|---------|
| `frontend/lib/wallet-context.tsx` | Added `BalanceInfo` interface with V1/V2/combined balances, `refreshBalances()` method, and automatic balance refresh on wallet connect |

---

### **Technical Implementation**

1. **Contract ID Constants**
   - `CONTRACT_ID` - V1 (Legacy) contract ID
   - `NEBULA_CONTRACT_ID` - V2 (Nebula) contract ID

2. **Custom Hooks**
   - `useContract('v1' | 'v2')` - Get contract instance by version
   - `useActiveContract()` - Get/set active contract version
   - `useBalances()` - Get balance info across both protocols
   - `useStellarProvider()` - Full provider context access

3. **Wallet Integration**
   - Balances are automatically fetched from both contracts on wallet connection
   - Combined balance is calculated across V1 + V2

---

### **Usage Example**

```tsx
import { useContract, useBalances, useWallet } from '@/lib/providers';

// Get specific contract by version
const v1Contract = useContract('v1');
const v2Contract = useContract('v2');

// Get user's balances across both protocols
const { v1, v2, combined, refreshBalances } = useBalances();

// Access wallet with balance info
const { address, balances } = useWallet();
```

---

### **Environment Variables Required**

```bash
NEXT_PUBLIC_CONTRACT_ID=        # V1 Contract ID
NEXT_PUBLIC_NEBULA_CONTRACT_ID= # V2 Contract ID (Nebula)
```

---

### **Labels**

- `[Frontend] Architecture Medium`

---

### **Checklist**

- [x] NEBULA_CONTRACT_ID constant added
- [x] `useContract(version: 'v1' | 'v2')` hook implemented
- [x] Wallet connection checks balances in both protocols
- [x] Environment configuration documented
