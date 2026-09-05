# HYDRO-VISION-3D — Model Training Guide

This guide is for training the final YOLOv8s detection model for Hydro-Vision-3D. The recommended training machine is an NVIDIA GPU system, specifically utilizing an RTX 5070.

---

## 1. Clone the Repository

Open PowerShell and run:

```powershell
git clone https://github.com/Luciifer71/hydro-vision-3D.git
cd hydro-vision-3D
```

Make sure you are on the latest `main` branch:

```powershell
git pull origin main
```

## 2. Create a Python Virtual Environment

Create the environment:

```powershell
python -m venv .venv
```

Activate it:

```powershell
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, run the following, then try activating again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

## 3. Install Dependencies

Install the project requirements:

```powershell
pip install -r requirements.txt
```

The project uses: PyTorch, Torchvision, Ultralytics YOLO, OpenCV, NumPy, Pillow, FastAPI, Uvicorn, and HTTPX.

## 4. Verify the NVIDIA GPU

Before training, verify that Windows can see the NVIDIA GPU:

```powershell
nvidia-smi
```

Then verify that PyTorch can access CUDA:

```powershell
python -c "import torch; print('PyTorch:', torch.__version__); print('CUDA available:', torch.cuda.is_available()); print('GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'Not detected')"
```

Expected result should look similar to:

```text
PyTorch: 2.x.x+cuXXX
CUDA available: True
GPU: NVIDIA GeForce RTX 5070
```

**Note:** If CUDA available is `False`, do not start the full training run. Check the PyTorch/CUDA installation first.

## 5. Obtain the Final Dataset

The dataset is intentionally not stored in GitHub because of its size.

**[INSERT DATASET TRANSFER METHOD HERE — e.g., Download the dataset from the provided Google Drive link / Copy it from the external SSD provided]**
//

https://drive.google.com/drive/u/0/folders/1LFl5HuBjrPT-tuYfSJEHGtQiHXOpC3bZ

The final YOLO-ready dataset must be placed exactly at:

```text
data/
└── yolo_ready_dataset/
    ├── train/
    │   ├── images/
    │   └── labels/
    ├── valid/
    │   ├── images/
    │   └── labels/
    ├── test/
    │   ├── images/
    │   └── labels/
    └── data.yaml
```

Do not rename `train`, `valid`, `test`, `images`, `labels`, or `data.yaml`.

## 6. Verify the Dataset Configuration

Open `data/yolo_ready_dataset/data.yaml`. It should contain:

```yaml
train: train/images
val: valid/images
test: test/images

nc: 6
names:
  0: cracks
  1: damaged_footpath
  2: drainage_overflow
  3: open_manhole
  4: potholes
  5: waterlogging_area
```

**Important:** The class IDs and names must remain exactly as shown. Do not change the order.

| ID | Class |
| :--- | :--- |
| 0 | cracks |
| 1 | damaged_footpath |
| 2 | drainage_overflow |
| 3 | open_manhole |
| 4 | potholes |
| 5 | waterlogging_area |

## 7. Verify the Dataset Exists

Run:

```powershell
Test-Path .\data\yolo_ready_dataset\data.yaml
```

Expected output: `True`. You can also check the folders using `Get-ChildItem .\data\yolo_ready_dataset`.

## 8. Verify the Training Script

The canonical training script for the final run is `train.py`. Do not use older scripts located inside the `scripts/` directory.

## 9. Training Configuration

The current training configuration is designed for the final YOLOv8s baseline:

| Setting | Value |
| :--- | :--- |
| **Model** | YOLOv8s |
| **Image size** | 640 |
| **Maximum epochs** | 175 |
| **Early stopping patience**| 40 |
| **Batch size** | 16 |
| **Seed** | 42 |
| **AMP** | Enabled |
| **Validation** | Enabled |
| **Device** | Automatically detected (CUDA) |

## 10. Start Training

Once everything above is verified, start training:

```powershell
python train.py
```

Training can take a significant amount of time. Do not close the terminal while training is running, and do not manually stop the training unless there is a problem.

## 11. Early Stopping

The maximum training length is 150 epochs. Early stopping is enabled with `patience = 40`. Training will stop automatically if validation performance does not improve for 40 consecutive epochs.

## 12. Model Checkpoints

Training outputs are stored under `runs/yolov8s_baseline/`. The important files are:

```text
runs/
└── yolov8s_baseline/
    └── weights/
        ├── best.pt
        └── last.pt
```

*   **best.pt:** The most important file. It contains the model checkpoint with the best validation performance and should be sent back for integration.
*   **last.pt:** The checkpoint from the most recent completed epoch, useful if training needs to be resumed.

## 13. What to Send After Training

After training finishes, send the following:

**Required:**
*   `runs/yolov8s_baseline/weights/best.pt`
*   Final training console output or a screenshot showing the final epoch, validation metrics, mAP50, mAP50-95, precision, and recall.

**Optional but useful:**
*   `runs/yolov8s_baseline/weights/last.pt`
*   The entire `runs/yolov8s_baseline/` folder (if size permits).

## 14. Important Training Rules

*   **Do not modify the dataset:** Do not rename classes, change IDs, move images between splits, modify labels, delete images, or regenerate the dataset unless explicitly instructed.
*   **Do not change train.py:** Keep the training configuration exactly as it is for the final run.
*   **Do not train using an old dataset:** Ensure YOLO is pointed to `data/yolo_ready_dataset/` and not `multiclass_dataset/`, `clean_dataset/`, or `final_dataset/`.
*   **Do not use old training scripts:** Only run `train.py`.

## 15. Troubleshooting: CUDA Not Detected

If CUDA is not detected, stop before starting the full run. Run:

```powershell
python -c "import torch; print(torch.cuda.is_available())"
```

If it prints `False`, send the output of the following commands for troubleshooting:

```powershell
nvidia-smi
python -c "import torch; print(torch.__version__); print(torch.version.cuda); print(torch.cuda.is_available())"
```

## 16. Troubleshooting: GPU Memory Runs Out

If training reports a CUDA out-of-memory error, do not modify the dataset. Report the error first. Check the RTX 5070's available VRAM and system configuration before considering changes to batch size or image size.

## 17. Troubleshooting: Dataset Path Is Missing

If you see an error involving `data/yolo_ready_dataset/data.yaml`, run:

```powershell
Test-Path .\data\yolo_ready_dataset\data.yaml
```

If it returns `False`, the dataset has not been placed correctly. Revisit Step 5.

## 18. Recommended Final Procedure Workflow

1. Clone repository
2. Create virtual environment
3. Install requirements
4. Verify NVIDIA GPU
5. Verify PyTorch CUDA
6. Copy final `yolo_ready_dataset`
7. Verify `data.yaml`
8. Run `python train.py`
9. Wait for training / early stopping
10. Locate `runs/yolov8s_baseline/weights/best.pt`
11. Send `best.pt` + final metrics

## 19. Final Checklist

Before running `python train.py`, confirm:

- [ ] Repository cloned successfully and `main` branch is up to date
- [ ] Virtual environment activated and requirements installed
- [ ] NVIDIA GPU detected and CUDA accessible by PyTorch
- [ ] `data/yolo_ready_dataset/data.yaml` exists
- [ ] Train, Validation, and Test images exist
- [ ] Dataset has exactly 6 classes and order has not changed
- [ ] `train.py` is being used (no old scripts or old datasets)

**Expected Final Deliverable:** `runs/yolov8s_baseline/weights/best.pt`