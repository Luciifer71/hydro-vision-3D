import cv2
import os
import glob

def create_video_from_images(image_folder, output_mp4_path, fps=15):
    # Retrieve and sort image files
    extensions = ("*.jpg", "*.jpeg", "*.png")
    images = []
    for ext in extensions:
        images.extend(glob.glob(os.path.join(image_folder, ext)))
    images.sort()

    if not images:
        print(f"No images found in {image_folder}")
        return

    # Read the first frame to get width and height
    first_frame = cv2.imread(images[0])
    height, width, _ = first_frame.shape

    # Define VideoWriter (MP4V codec)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(output_mp4_path, fourcc, fps, (width, height))

    print(f"Stitching {len(images)} frames into {output_mp4_path}...")
    for img_path in images:
        frame = cv2.imread(img_path)
        # Resize to match first frame dimensions if needed
        if frame.shape[:2] != (height, width):
            frame = cv2.resize(frame, (width, height))
        writer.write(frame)

    writer.release()
    print(f"Video saved successfully: {output_mp4_path}")

if __name__ == "__main__":
    # Example usage: convert extracted Roboflow train images to a test video
    input_dir = "path/to/extracted_dataset/train/images"
    output_video = "data/raw_video/roboflow_maritime_test.mp4"
    create_video_from_images(input_dir, output_video, fps=10)