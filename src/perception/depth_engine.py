"""
HYDRO-VISION-3D — Monocular depth estimation
=============================================
Depth Anything V2, wrapped so it runs on CUDA, Apple MPS or CPU without any
caller having to know which.

IMPORTANT — what this produces and what it does not:
Depth Anything V2 emits RELATIVE INVERSE depth, normalised per frame. There
is no metric scale in it. The same pothole at 5 m and 25 m altitude produces
different raw values, and water surfaces are close to opaque to it. So this
module returns an array for RANKING and VISUALISATION only. Anything claiming
centimetres or cubic metres from it would be fabricated.
"""

import base64
from typing import Optional, Tuple

import cv2
import numpy as np
import torch
from PIL import Image
from transformers import pipeline


class DepthEngine:
    """Device-agnostic wrapper. Falls back gracefully rather than failing."""

    MODEL_ID = "depth-anything/Depth-Anything-V2-Small-hf"

    def __init__(self, device: str = "auto"):
        self.device_label, pipe_device = self._resolve_device(device)
        print(f"[INFO] Initializing Depth Anything V2 on {self.device_label}...")

        try:
            self.pipe = pipeline(
                task="depth-estimation",
                model=self.MODEL_ID,
                device=pipe_device,
            )
        except Exception as e:
            # MPS and older accelerators occasionally reject an op the model
            # needs. CPU is slow but always works, and a slow depth stage is
            # far better than a dead pipeline.
            if pipe_device != -1:
                print(f"[WARNING] Depth init failed on {self.device_label} "
                      f"({type(e).__name__}: {e}). Falling back to CPU.")
                self.device_label = "CPU (fallback)"
                self.pipe = pipeline(
                    task="depth-estimation",
                    model=self.MODEL_ID,
                    device=-1,
                )
            else:
                raise

        print(f"[SUCCESS] Depth Anything V2 loaded ({self.device_label}).")

    @staticmethod
    def _resolve_device(device: str) -> Tuple[str, object]:
        """Map our device string to what the transformers pipeline expects.

        Returns (human label, pipeline device arg). The pipeline takes an int
        index for CUDA, the string "mps" for Apple Silicon, and -1 for CPU —
        an earlier version tested only for "cuda", so Macs silently ran on CPU.
        """
        d = (device or "auto").lower()

        cuda_ok = torch.cuda.is_available()
        mps_ok = (hasattr(torch.backends, "mps")
                  and torch.backends.mps.is_available())

        if d.startswith("cuda") and cuda_ok:
            idx = 0
            if ":" in d:
                try:
                    idx = int(d.split(":", 1)[1])
                except ValueError:
                    idx = 0
            return f"CUDA:{idx} ({torch.cuda.get_device_name(idx)})", idx

        if d == "mps" and mps_ok:
            return "Apple MPS", "mps"

        if d == "cpu":
            return "CPU", -1

        # "auto", or a requested device that isn't actually present.
        if cuda_ok:
            return f"CUDA:0 ({torch.cuda.get_device_name(0)})", 0
        if mps_ok:
            return "Apple MPS", "mps"
        if d not in ("auto", "cpu"):
            print(f"[WARNING] Requested device '{device}' unavailable; using CPU.")
        return "CPU", -1

    def predict_depth(self, pil_image: Image.Image
                      ) -> Tuple[Optional[np.ndarray], Optional[str]]:
        """Return (depth_array, base64_png_heatmap).

        Returns (None, None) on failure rather than raising: depth is an
        enhancement, and losing it must never stop detection.
        """
        try:
            result = self.pipe(pil_image)
            depth_pil = result["depth"]
            depth_array = np.array(depth_pil, dtype=np.float32)

            norm = cv2.normalize(depth_array, None, 0, 255,
                                 norm_type=cv2.NORM_MINMAX).astype(np.uint8)
            colormap = cv2.applyColorMap(norm, cv2.COLORMAP_INFERNO)

            ok, buffer = cv2.imencode(".png", colormap)
            b64 = base64.b64encode(buffer).decode("utf-8") if ok else None
            return depth_array, b64

        except Exception as e:
            print(f"[DEPTH WARNING] Inference failed: {type(e).__name__}: {e}")
            return None, None

    @property
    def device(self) -> str:
        return self.device_label