from pathlib import Path
from PIL import Image, ImageCms
from io import BytesIO
import base64

root = Path(__file__).resolve().parents[1]
public = root / "public"
icons = public / "icons"
icons.mkdir(exist_ok=True)
original = Image.open(public / "brand/jing-le-original-avatar.jpg")
# The supplied JPEG is CMYK with Japan Color 2001 Coated ICC. Honor that
# profile when exporting RGB icons, matching the original in web browsers.
if original.info.get("icc_profile"):
    source = ImageCms.profileToProfile(original,
        ImageCms.ImageCmsProfile(BytesIO(original.info["icc_profile"])),
        ImageCms.createProfile("sRGB"), outputMode="RGB")
else:
    source = original.convert("RGB")
for size in (32, 180, 192, 512):
    source.resize((size, size), Image.Resampling.LANCZOS).save(icons / f"classsign-brand-{size}.png")
source.save(public / "favicon.ico", format="ICO", sizes=[(16,16), (32,32), (48,48)])
maskable = Image.new("RGB", (512,512), source.getpixel((0,0)))
maskable.paste(source.resize((384,384), Image.Resampling.LANCZOS), (64,64))
maskable.save(icons / "classsign-brand-maskable-512.png")
encoded = base64.b64encode((icons / "classsign-brand-192.png").read_bytes()).decode("ascii")
(public / "icon.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><image width="192" height="192" href="data:image/png;base64,' + encoded + '"/></svg>\n', encoding="utf-8")
