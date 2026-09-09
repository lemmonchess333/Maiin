"""Translate one master bar; register generated hand cores to its grip anchors.

The hand cores translate by integer offsets. Only their forearm junctions use
smooth displacement. This is a raster repair, not an anatomical approval.
Masks are specific to the inspected 1024x1536 sources; build.py pins their hashes.
"""
import numpy as np
from PIL import Image
from scipy.ndimage import binary_closing, binary_dilation, binary_fill_holes, label, map_coordinates

Y, X = np.mgrid[:1536, :1024]


def athlete_mask(rgb):
    bright = (rgb.max(2) > 155) & (X < 680) & (Y > 250) & (Y < 890)
    labels, _ = label(binary_closing(bright, iterations=2))
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    # Connected anatomy excludes disconnected metallic highlights. A raw colour
    # threshold wrongly punched holes in the bar and cable attachment.
    return binary_fill_holes(labels == sizes.argmax())


def smooth(value):
    value = np.clip(value, 0, 1)
    return value * value * (3 - 2 * value)


def repair_handle(image, master, pose, travel):
    if pose == 0:
        return image, []
    original = np.asarray(image)
    source = original.copy()
    reference = np.asarray(master)
    body = athlete_mask(source)
    reference_body = athlete_mask(reference)
    bar = ((reference.max(2) > 10) & ~binary_dilation(reference_body, iterations=1)
           & (Y >= 250) & (Y < 370) & (X < 700))

    # Erase the old generated bar only outside the connected athlete silhouette.
    # The left post begins at x684 and is restored before the new bar is layered.
    for x in range(40, 684):
        if pose == 2:
            top = np.interp(x, [40, 130, 200, 525, 600, 700], [640, 604, 594, 596, 623, 680])
        else:
            top = np.interp(x, [40, 130, 200, 530, 605, 700], [476, 430, 407, 403, 428, 475])
        y0, y1 = int(top) - 10, int(top) + 50
        source[y0:y1, x][~body[y0:y1, x]] = 0

    shifts = ([(166, 446, 0, 0), (586, 427, 0, -8)] if pose == 1 else
              [(166, 637, 29, 10), (586, 618, 13, -12)])
    sx, sy = X.astype(float), Y.astype(float)
    for cx, cy, dx, dy in shifts:
        weight = ((1 - smooth((abs(X - cx) - 40) / 40))
                  * (1 - smooth((Y - cy - 20) / 110))
                  * smooth((Y - cy + 100) / 40))
        if cx < 300:
            weight *= 1 - smooth((X - 190) / 20)
        sx -= dx * weight
        sy -= dy * weight
    output = np.stack([map_coordinates(source[:, :, c], [sy, sx], order=1,
                                      mode='constant', cval=0) for c in range(3)], 2)
    occlusion = map_coordinates(body.astype(float), [sy, sx], order=0) > 0
    alpha = np.zeros_like(bar)
    alpha[travel:] = bar[:-travel]
    layer = np.zeros_like(reference)
    layer[travel:] = reference[:-travel]
    output[:, 684:] = original[:, 684:]
    alpha &= ~occlusion
    output[alpha] = layer[alpha]
    assert np.array_equal(output[alpha], layer[alpha])
    # The central visible shaft and both end samples use the same source pixels.
    for x0, y0, x1, y1 in [(400, 274, 530, 290), (76, 345, 90, 351), (650, 321, 677, 330)]:
        assert np.array_equal(output[y0+travel:y1+travel, x0:x1], reference[y0:y1, x0:x1])
    # A substantial finger/palm core is translated without rescaling. These are
    # source-pose cores, not a claim that generated finger anatomy is identical.
    evidence = []
    for cx, cy, dx, dy in shifts:
        x0, x1, y0, y1 = cx-12, cx+12, cy-12, cy+8
        patch = original[y0-dy:y1-dy, x0-dx:x1-dx]
        visible = patch.max(2) > 155
        assert visible.sum() > 200
        assert np.array_equal(output[y0:y1, x0:x1][visible], patch[visible])
        evidence.append({'targetCoreCenter': [cx, cy], 'translationPx': [dx, dy],
                         'translatedCorePixels': int(visible.sum()), 'corePixelsExact': True})
    return Image.fromarray(output.astype('uint8')), evidence
