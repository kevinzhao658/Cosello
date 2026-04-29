"""Shared test fixtures.

Adds the backend root to sys.path so tests can `import main` even when pytest
is invoked from the repo root.
"""
import os
import sys
from pathlib import Path

# Backend is the parent of this tests directory.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Anthropic SDK refuses to construct without an API key. Set a dummy one for tests
# (the client itself is monkeypatched per-test).
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-test-fake")
