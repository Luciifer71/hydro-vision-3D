# import os
# from ultralytics import YOLO

# def main():
#     print("[INFO] Starting Deep Training on M4 Pro...")
    
#     local_project_path = os.path.join(os.getcwd(), 'runs')
#     model = YOLO('yolov8s.pt')

#     results = model.train(
#         data='data/multiclass_dataset/road_hazards.yaml',
#         epochs=300,          # Let it train until it's perfect
#         imgsz=640,
#         batch=32,            # Increased batch size because you have 48GB of RAM!
#         patience=25,         # Will automatically stop when accuracy peaks
#         device='mps',        # Use Apple Silicon GPU
#         project=local_project_path,
#         name='hydro_vision_m4pro',
#         exist_ok=True
#     )
#     print("Training complete!")

# if __name__ == '__main__':
#     main()

import os
from ultralytics import YOLO

def main():
    print("Resuming YOLOv8 training after power loss...")
    
    # Point directly to the last saved checkpoint instead of the base model
    checkpoint_path = os.path.join(os.getcwd(), 'runs', 'hydro_vision_m4pro', 'weights', 'last.pt')
    model = YOLO(checkpoint_path)

    # YOLO automatically remembers your previous settings (batch=32, mps, patience=25, etc.)
    results = model.train(resume=True)
    
    print("Training complete!")

if __name__ == '__main__':
    main()