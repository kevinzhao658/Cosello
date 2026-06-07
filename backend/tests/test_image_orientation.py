"""Tests for EXIF orientation handling in _preprocess_image_bytes.

Phone portrait photos store landscape pixels with an EXIF orientation tag
instructing the viewer to rotate for display. Without applying that tag to
the actual pixels before re-saving, the output appears sideways.
"""

import io
import struct

import pytest
from PIL import Image, ImageOps

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import _preprocess_image_bytes


def _make_landscape_jpeg_with_exif_orientation(orientation: int) -> bytes:
    """Build an in-memory JPEG that is physically 200x100 (landscape) but
    carries the given EXIF orientation tag so a viewer should rotate it.

    orientation=6 means "rotate 90 CW for display" — a portrait shot from
    a phone that physically stored pixels in landscape order.
    """
    # Create a 200-wide x 100-tall landscape image
    img = Image.new("RGB", (200, 100), color=(255, 0, 0))

    # Build EXIF data with orientation tag (0x0112)
    exif = img.getexif()
    exif[0x0112] = orientation  # Orientation tag

    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif.tobytes())
    return buf.getvalue()


def test_exif_orientation_6_applied_to_pixels():
    """EXIF orientation=6 (rotate 90 CW) must be baked into pixels.

    Input:  physically 200x100 landscape JPEG with orientation=6 tag
    Output: physically ~100x200 portrait JPEG with orientation normalized
    """
    raw = _make_landscape_jpeg_with_exif_orientation(orientation=6)

    # Verify the raw input is actually landscape (200 wide, 100 tall)
    source = Image.open(io.BytesIO(raw))
    assert source.width == 200 and source.height == 100, (
        f"Test setup error: source should be 200x100, got {source.width}x{source.height}"
    )

    # Call the function under test
    result_bytes = _preprocess_image_bytes(raw)
    result = Image.open(io.BytesIO(result_bytes))

    # After orientation is applied, pixels should be portrait (height > width)
    assert result.height > result.width, (
        f"Expected portrait output (height > width) after EXIF orientation=6 "
        f"was applied, but got {result.width}x{result.height}. "
        f"The orientation tag was NOT baked into the pixels."
    )


def test_exif_orientation_normalized_after_transpose():
    """After transposing, the output image should not carry a residual
    orientation tag that would cause a double-rotation on display.

    orientation must be absent OR normalized to 1 (upright).
    """
    raw = _make_landscape_jpeg_with_exif_orientation(orientation=6)
    result_bytes = _preprocess_image_bytes(raw)
    result = Image.open(io.BytesIO(result_bytes))

    exif = result.getexif()
    orientation_tag = exif.get(0x0112)
    assert orientation_tag in (None, 1), (
        f"Residual EXIF orientation tag found: {orientation_tag}. "
        f"This would cause a double-rotation on display."
    )


def test_image_with_no_exif_passes_through_unchanged_dimensions():
    """Images without EXIF orientation should be unaffected — dimensions
    must remain the same (within any thumbnail rounding).
    """
    img = Image.new("RGB", (100, 150), color=(0, 255, 0))  # portrait, no exif
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    raw = buf.getvalue()

    result_bytes = _preprocess_image_bytes(raw)
    result = Image.open(io.BytesIO(result_bytes))

    # Should still be portrait (height > width)
    assert result.height > result.width, (
        f"Portrait image without EXIF should remain portrait, "
        f"got {result.width}x{result.height}"
    )


def test_exif_orientation_1_is_noop():
    """Orientation=1 means already upright — no rotation should happen."""
    img = Image.new("RGB", (100, 200), color=(0, 0, 255))  # portrait
    exif = img.getexif()
    exif[0x0112] = 1  # upright — no rotation needed
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif.tobytes())
    raw = buf.getvalue()

    result_bytes = _preprocess_image_bytes(raw)
    result = Image.open(io.BytesIO(result_bytes))

    # Should still be portrait
    assert result.height > result.width, (
        f"Orientation=1 (upright) image should remain portrait, "
        f"got {result.width}x{result.height}"
    )
