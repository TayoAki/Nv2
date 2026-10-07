"""Photo loading: MediaPipe aborts the process on mask widths that aren't a multiple of 4."""

import io

import pytest
from PIL import Image

from detect import load_image


@pytest.mark.parametrize("width", [736, 737, 738, 739, 1179])
def test_load_image_width_is_a_multiple_of_4(width):
    buffer = io.BytesIO()
    Image.new("RGB", (width, 1300)).save(buffer, format="JPEG")
    assert load_image(buffer.getvalue()).shape[1] % 4 == 0
