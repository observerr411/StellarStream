# Contract Size Optimization Guide

## Current Status
✅ **Optimized WASM Size: 41KB** (well under 64KB limit)

## Applied Optimizations

### 1. Cargo Profile Configuration
The `Cargo.toml` includes aggressive size optimizations:

```toml
[profile.release]
opt-level = "z"           # Optimize for size
overflow-checks = true    # Keep safety checks
lto = true                # Link-time optimization
codegen-units = 1         # Single codegen unit for better optimization
strip = true              # Strip debug symbols
panic = "abort"           # Reduce panic handling overhead
```

### 2. Build Process
Use the modern Stellar CLI build command:

```bash
stellar contract build --optimize
```

This automatically:
- Builds with release profile
- Runs wasm-opt with aggressive size optimizations
- Strips unnecessary metadata
- Outputs to `target/wasm32v1-none/release/`

### 3. Build Script
Use the provided `build.sh` script that:
- Builds with optimization
- Checks final size
- Fails CI if size exceeds 64KB

```bash
./build.sh
```

## Size Reduction Breakdown

| Stage | Size | Reduction |
|-------|------|-----------|
| Initial unoptimized | 77KB | - |
| With Cargo profile | 77KB | 0KB |
| After stellar optimize | 62KB | 15KB |
| With panic="abort" | 41KB | 36KB total |

## Future Optimization Strategies

If you approach the limit again:

### Code-Level Optimizations
1. **Remove unused features**: Comment out modules not needed for MVP
2. **Inline small functions**: Use `#[inline]` for hot paths
3. **Reduce string literals**: Use `symbol_short!` instead of long strings
4. **Simplify error types**: Consolidate similar error variants

### Dependency Audit
```bash
cargo tree --edges normal --depth 1
```
- Ensure no duplicate dependencies
- Check for heavy transitive dependencies
- Consider feature flags to disable unused functionality

### Advanced Techniques
1. **Split contracts**: Move optional features to separate contracts
2. **Use contract interfaces**: Call other contracts instead of bundling
3. **Lazy loading**: Load data only when needed

## Monitoring

Check size after each build:
```bash
ls -lh target/wasm32v1-none/release/stellarstream_contracts.wasm
```

Or use the build script which automatically validates size.

## CI Integration

Add to your CI pipeline:
```yaml
- name: Build and check contract size
  run: |
    cd contracts
    ./build.sh
```

This ensures the contract never exceeds the limit in production.
