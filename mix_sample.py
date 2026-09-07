
import glob, random, shutil, os
random.seed(0)
base = "data/5th_sept_final_dataset_combined/final_dataset"
for d, s, n in [("train", "train", 500), ("valid", "val", 120)]:
    imgs = [p.replace(os.sep, "/") for p in glob.glob(f"{base}/{s}/images/*.jpg")]
    random.shuffle(imgs)
    c = 0
    for i in imgs:
        lab = i.replace("/images/", "/labels/").replace(".jpg", ".txt")
        if os.path.exists(lab):
            shutil.copy(i, f"data/mixed_finetune/{d}/images/")
            shutil.copy(lab, f"data/mixed_finetune/{d}/labels/")
            c += 1
        if c >= n:
            break
    print(d, c)

