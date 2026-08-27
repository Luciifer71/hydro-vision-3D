import os
from ultralytics import YOLO

def main():
    print("[INFO] Starting 7-Class Fine-Tuning initialized from 300-Epoch Pothole Weights...")
    
    # 1. Load the best weights from your current 300-epoch run
    checkpoint_path = os.path.join(os.getcwd(), 'runs', 'hydro_vision_m4pro', 'weights', 'best.pt')
    model = YOLO(checkpoint_path)

    # 2. Train on the newly merged 7-class dataset
    results = model.train(
        data='data/multiclass_dataset/road_hazards.yaml',
        epochs=80,                          # 50-80 epochs is sufficient for fine-tuning
        imgsz=640,
        batch=16,                           # Stable batch size for MPS
        amp=False,                          # Keep AMP disabled for tensor math stability
        patience=20,
        device='mps',
        project=os.path.join(os.getcwd(), 'runs'),
        name='hydro_vision_7class_final',
        exist_ok=True
    )
    print("[SUCCESS] 7-Class Model Fine-Tuning Complete!")

if __name__ == '__main__':
    main()