#!/bin/bash
# DNS-over-HTTPS MX lookup (the container has no dig / local DNS for MX). One JSON line per domain.
d="$1"; out=$(curl -sS -m 15 "https://dns.google/resolve?name=$d&type=MX" 2>/dev/null); printf '{"domain":"%s","r":%s}\n' "$d" "${out:-null}"
