"""Register bundled radars against extracted CS2 overviews. Requires numpy and opencv-python.

Run after build:server: python tools/calibrate-radars.py
Downloads are cached outside the repository. Output is an audit, not a runtime dependency.
"""
import concurrent.futures
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import urllib.request

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(tempfile.gettempdir()) / "playbook-radar-calibration"
CACHE.mkdir(exist_ok=True)
SOURCE_ROOT = "https://raw.githubusercontent.com/MurkyYT/cs2-map-icons/"
SOURCE_REVISION = "4b650b20495ad6659840dd1dd565d43d891e1153"


def download(url):
    path = CACHE / hashlib.sha256(url.encode()).hexdigest()
    if not path.exists():
        with urllib.request.urlopen(url, timeout=30) as response:
            path.write_bytes(response.read())
    return path.read_bytes()


def register(source, target):
    height, width = target.shape[:2]
    resized = cv2.resize(target, (round(width * 1024 / max(width, height)), round(height * 1024 / max(width, height))))
    sift = cv2.SIFT_create(nfeatures=12000, contrastThreshold=.015)
    kp1, d1 = sift.detectAndCompute(source, None)
    kp2, d2 = sift.detectAndCompute(resized, None)
    pairs = cv2.BFMatcher().knnMatch(d1, d2, k=2)
    matches = [a for a, b in pairs if a.distance < .72 * b.distance]
    if len(matches) < 10:
        raise ValueError(f"only {len(matches)} matching features")
    src = np.float32([kp1[m.queryIdx].pt for m in matches])
    dst = np.float32([kp2[m.trainIdx].pt for m in matches]) * max(width, height) / 1024
    transform, mask = cv2.estimateAffine2D(src, dst, ransacReprojThreshold=4, maxIters=10000)
    if transform is None:
        raise ValueError("no reliable registration")
    src, dst = src[mask.ravel() == 1], dst[mask.ravel() == 1]
    if len(src) < 10 or np.any(np.ptp(src, axis=0) < 150):
        raise ValueError(f"insufficient coverage: {len(src)} inliers")
    if abs(transform[0, 1]) > .005 or abs(transform[1, 0]) > .005:
        raise ValueError("image is rotated or skewed")
    for _ in range(3):
        axes = [np.linalg.lstsq(np.column_stack([src[:, i], np.ones(len(src))]), dst[:, i], rcond=None)[0] for i in [0, 1]]
        errors = np.column_stack([np.abs(src[:, i] * axes[i][0] + axes[i][1] - dst[:, i]) for i in [0, 1]])
        keep = np.max(errors, axis=1) <= 4
        if keep.all():
            break
        src, dst = src[keep], dst[keep]
    if len(src) < 10 or np.any(np.ptp(src, axis=0) < 150):
        raise ValueError("insufficient coverage after axis fit")
    residual = max(float(np.max(np.abs(src[:, i] * axes[i][0] + axes[i][1] - dst[:, i]))) for i in [0, 1])
    if residual > 4 or any(axis[0] <= 0 for axis in axes):
        raise ValueError(f"axis residual {residual:.2f}px")
    # Independent image correspondences exercise the runtime projection against
    # actual matched image pixels, rather than only checking its coefficients.
    picks = sorted(set(int(np.argmin(src[:, i])) for i in [0, 1]) | set(int(np.argmax(src[:, i])) for i in [0, 1]))
    return axes, len(src), residual, [(src[i].tolist(), dst[i].tolist()) for i in picks]


def calibrate(map_definition, available):
    name = map_definition["mapName"]
    url = map_definition.get("radarUrl")
    result = {"mapName": name, "radarUrl": url}
    try:
        if not url:
            raise ValueError("no bundled radar")
        data = available.get(name, {})
        overview = data.get("radar_info", {})
        if not all(k in overview for k in ["pos_x", "pos_y", "scale"]):
            raise ValueError("missing overview coordinates")
        paths = data.get("radar_paths", [])
        source_url = next((p for p in paths if p.endswith(f"/{name}_radar_tga.png")), None) or next((p for p in paths if p.endswith(f"/{name}_radar_psd.png")), None)
        if not source_url:
            raise ValueError("missing game radar")
        target_bytes = (ROOT / "client/public" / url.lstrip("/")).read_bytes()
        source = cv2.imdecode(np.frombuffer(download(source_url), np.uint8), cv2.IMREAD_GRAYSCALE)
        target = cv2.imdecode(np.frombuffer(target_bytes, np.uint8), cv2.IMREAD_GRAYSCALE)
        h, w = target.shape
        axes, count, residual, samples = register(source, target)
        # Overview scale is units per pixel of the logical 1024px radar,
        # even when an extracted texture is 2048px.
        scale = overview["scale"] * 1024 / source.shape[1]
        xs, xo = axes[0]
        ys, yo = axes[1]
        result.update(radarWidth=w, radarHeight=h,
            projection={"xScale": xs / scale / w, "xOffset": (xo - xs * overview["pos_x"] / scale) / w,
                        "yScale": -ys / scale / h, "yOffset": (yo + ys * overview["pos_y"] / scale) / h},
            inliers=count, maxResidual=round(residual, 3), sourceUrl=source_url,
            overview=overview, imageSha256=hashlib.sha256(target_bytes).hexdigest())
        result["samples"] = [{"world": [a[0] * scale + overview["pos_x"], overview["pos_y"] - a[1] * scale],
            "pixel": b} for a, b in samples]
        sections = overview.get("verticalsections", {})
        if len(sections) > 1 and name != "de_nuke":
            split = sections["default"]["AltitudeMin"]
            section = next(k for k, v in sections.items() if k != "default" and v["AltitudeMax"] == split)
            lower_url = next((p for p in paths if p.endswith(f"/{name}_{section}_radar_psd.png") or p.endswith(f"/{name}_{section}_radar_tga.png")), None)
            if not lower_url:
                raise ValueError("missing lower game radar")
            lower_source = cv2.imdecode(np.frombuffer(download(lower_url), np.uint8), cv2.IMREAD_GRAYSCALE)
            lower_target_bytes = (ROOT / "client/public" / map_definition["radarLowerUrl"].lstrip("/")).read_bytes() if map_definition.get("radarLowerUrl") else target_bytes
            lower_target = cv2.imdecode(np.frombuffer(lower_target_bytes, np.uint8), cv2.IMREAD_GRAYSCALE)
            lower_axes, lower_count, lower_residual, lower_samples = register(lower_source, lower_target)
            lower_scale = overview["scale"] * 1024 / lower_source.shape[1]
            lx, lxo = lower_axes[0]
            ly, lyo = lower_axes[1]
            result["projection"].update(altitudeSplit=split, lower={
                "xScale": lx / lower_scale / w, "xOffset": (lxo - lx * overview["pos_x"] / lower_scale) / w,
                "yScale": -ly / lower_scale / h, "yOffset": (lyo + ly * overview["pos_y"] / lower_scale) / h})
            result["lowerRegistration"] = {"sourceUrl": lower_url, "inliers": lower_count, "maxResidual": round(lower_residual, 3)}
            result["lowerSamples"] = [{"world": [a[0] * lower_scale + overview["pos_x"], overview["pos_y"] - a[1] * lower_scale], "pixel": b} for a, b in lower_samples]
            if map_definition.get("radarLowerUrl"):
                result.update(radarLowerUrl=map_definition["radarLowerUrl"], lowerImageSha256=hashlib.sha256(lower_target_bytes).hexdigest())
    except Exception as error:
        result["error"] = str(error)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="write verified bundled calibration data")
    parser.add_argument("--revision", default=SOURCE_REVISION, help="source commit to register against")
    args = parser.parse_args()
    cv2.setRNGSeed(0)
    maps = json.loads(subprocess.check_output(["node", "--input-type=module", "-e",
        "import { BUILT_IN_MAPS } from './build/client/src/lib/maps.js'; console.log(JSON.stringify(BUILT_IN_MAPS));"], cwd=ROOT))
    source_base = SOURCE_ROOT + args.revision + "/"
    available = json.loads(download(source_base + "data/available.json").decode().replace(SOURCE_ROOT + "main/", source_base))["maps"]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda m: calibrate(m, available), maps))
    output = CACHE / "audit.json"
    output.write_text(json.dumps(results, indent=2), encoding="utf-8")
    for result in results:
        print(result["mapName"], result.get("error", f"{result.get('inliers')} inliers, {result.get('maxResidual')}px"))
        if "lowerRegistration" in result:
            print("  lower:", result["lowerRegistration"])
    print(f"Audit: {output}")
    if args.write:
        verified = [r for r in results if "error" not in r and r["mapName"] not in ["de_anubis", "de_nuke"]]
        content = "// Generated by tools/calibrate-radars.py --write. Image registration evidence is kept for tests.\n"
        content += "// Source: https://github.com/MurkyYT/cs2-map-icons (CS2 radar images and overview data).\n"
        runtime_keys = ["mapName", "radarUrl", "radarLowerUrl", "radarWidth", "radarHeight", "projection"]
        runtime = [{k: r[k] for k in runtime_keys if k in r} for r in verified]
        content += "export const BUNDLED_RADAR_CALIBRATIONS = " + json.dumps(runtime, indent=2) + " as const;\n"
        (ROOT / "client/src/lib/bundled-radar-calibrations.ts").write_text(content, encoding="utf-8")
        evidence = "// Generated image correspondences and asset hashes. Regenerate with tools/calibrate-radars.py --write.\n"
        evidence += "export const RADAR_CALIBRATION_EVIDENCE = " + json.dumps(verified, indent=2) + " as const;\n"
        (ROOT / "test/radar-calibration-evidence.ts").write_text(evidence, encoding="utf-8")
