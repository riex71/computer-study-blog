#!/usr/bin/env python3
"""Studybase KV cache size calculator. No GPU/dependencies required.

This is a storage-size estimator for dense full-context self attention,
not a runtime latency predictor or a model-quality evaluation.
"""

import argparse

MIB = 1024**2


def conventional_cache_mib(batch, tokens, layers, kv_heads, head_dim, bytes_per_elem):
    return (2 * batch * tokens * layers * kv_heads * head_dim * bytes_per_elem) / MIB


def mla_cache_mib(batch, tokens, layers, latent_dim, rope_dim, bytes_per_elem):
    return (batch * tokens * layers * (latent_dim + rope_dim) * bytes_per_elem) / MIB


def main():
    parser = argparse.ArgumentParser(description="KV Cache storage estimator, not GPU benchmark")
    parser.add_argument("--batch", type=int, default=1)
    parser.add_argument("--tokens", type=int, default=4096)
    parser.add_argument("--layers", type=int, default=32)
    parser.add_argument("--query-heads", type=int, default=32)
    parser.add_argument("--gqa-kv-heads", type=int, default=8)
    parser.add_argument("--head-dim", type=int, default=128)
    parser.add_argument("--dtype-bytes", type=int, default=2)
    parser.add_argument("--latent-dim", type=int, default=512)
    parser.add_argument("--rope-dim", type=int, default=64)
    args = parser.parse_args()

    if any(value < 1 for value in vars(args).values()):
        parser.error("모든 인수는 양의 정수여야 합니다.")
    if args.query_heads % args.gqa_kv_heads != 0:
        parser.error("query-heads는 gqa-kv-heads로 나누어떨어져야 합니다.")

    common = (args.batch, args.tokens, args.layers)
    modes = {
        f"MHA (KV {args.query_heads})": conventional_cache_mib(*common, args.query_heads, args.head_dim, args.dtype_bytes),
        f"GQA (KV {args.gqa_kv_heads})": conventional_cache_mib(*common, args.gqa_kv_heads, args.head_dim, args.dtype_bytes),
        f"MLA ({args.latent_dim}+{args.rope_dim})": mla_cache_mib(*common, args.latent_dim, args.rope_dim, args.dtype_bytes),
        "MQA (KV 1)": conventional_cache_mib(*common, 1, args.head_dim, args.dtype_bytes),
    }
    baseline = next(iter(modes.values()))
    print(f"B={args.batch} T={args.tokens} L={args.layers} Q={args.query_heads} head_dim={args.head_dim} dtype_bytes={args.dtype_bytes}")
    print("방식                     MiB        GiB     MHA 대비")
    print("-" * 61)
    for name, mib in modes.items():
        print(f"{name:<23} {mib:>8,.1f} {mib / 1024:>10.3f} {100 * mib / baseline:>10.3f}%")
    print("\n주의: KV 저장 텐서의 계산값이며 모델 가중치, allocator, runtime 메모리 등은 제외합니다.")


if __name__ == "__main__":
    main()
