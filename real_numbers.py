from ultralytics import YOLO

if __name__ == "__main__":
    m = YOLO("best.pt")   # root-level, the 5070/6-class one
    r = m.val(data="data/yolo_ready_dataset/data.yaml")
    print("mAP50:", r.box.map50)
    print("mAP50-95:", r.box.map)
    print("Per-class mAP50-95:", r.box.maps)