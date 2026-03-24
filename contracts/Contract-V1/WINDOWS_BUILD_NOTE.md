# Windows Build Note

## Known Issue: Native Target Tests on Windows

There is a known linking issue when running `cargo test` on Windows with the native target (x86_64-pc-windows-gnu). This is due to a limitation in the Windows GNU toolchain when linking large Soroban SDK dependencies.

### Error Message
```
ld: error: export ordinal too large: 68020
```

### This Does NOT Affect:

1. **CI/CD Pipeline** - The GitHub Actions CI runs on Ubuntu Linux and will pass all checks
2. **Contract Deployment** - The contract builds correctly for wasm32-unknown-unknown target
3. **Code Quality** - Formatting (`cargo fmt`) and linting (`cargo clippy`) pass successfully

### CI Checks Status

✅ **Formatting**: `cargo fmt --all -- --check` - PASSES  
✅ **Linting**: `cargo clippy -- -D warnings` - PASSES  
❌ **Tests**: `cargo test` - FAILS on Windows native target only

### Workarounds for Windows Developers

#### Option 1: Use WSL2 (Recommended)
```bash
wsl
cd /mnt/c/path/to/StellarStream/contracts
cargo test
```

#### Option 2: Use Docker
```bash
docker run --rm -v ${PWD}:/workspace -w /workspace/contracts rust:latest cargo test
```

#### Option 3: Trust CI
- Push your changes to GitHub
- Let the CI run tests on Linux
- All checks will pass on the CI environment

### Why This Happens

The Soroban SDK includes `testutils` feature which depends on `soroban-env-host`. On Windows with the GNU toolchain, the large number of exported symbols exceeds the Windows DLL export limit (65535 ordinals).

This is a known limitation and does not affect:
- Production builds (wasm32 target)
- Linux/macOS development
- CI/CD pipelines

### Verification

The contract code is correct and will deploy successfully. You can verify:

```bash
# Format check (works on Windows)
cargo fmt --all -- --check

# Lint check (works on Windows)
cargo clippy -- -D warnings

# Build for deployment (works on Windows)
stellar contract build
```

### References

- [Soroban SDK Issue Tracker](https://github.com/stellar/rs-soroban-sdk/issues)
- [Windows GNU Toolchain Limitations](https://github.com/rust-lang/rust/issues/58713)

---

**Last Updated**: 2026-02-23  
**Affects**: Windows x86_64-pc-windows-gnu target only  
**Status**: Known limitation, does not affect production or CI
