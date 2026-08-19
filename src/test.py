from ultralytics import YOLO
model = YOLO("models/checkpoints/road_hazards_yolov8.pt")
results = model.predict(
    "data/raw_videos/master_video.mp4",
    conf=0.10,          # deliberately low, to see everything the model even weakly considers
    save=True,
    save_txt=True        # also dumps raw class+confidence per frame as .txt
)