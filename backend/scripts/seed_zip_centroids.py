"""Idempotent seed for Manhattan ZIP centroids. Static data — no runtime API.
Re-run safe (upsert by zip_code). Source: US Census ZCTA gazetteer (approx).
Run: cd backend && python3 -m scripts.seed_zip_centroids
"""
from database import SessionLocal
from models import ZipCentroid

MANHATTAN_ZIPS = [
    ("10001", 40.750, -73.997), ("10002", 40.715, -73.986), ("10003", 40.731, -73.989),
    ("10004", 40.704, -74.012), ("10005", 40.706, -74.009), ("10006", 40.709, -74.013),
    ("10007", 40.714, -74.007), ("10009", 40.726, -73.979), ("10010", 40.739, -73.982),
    ("10011", 40.742, -74.000), ("10012", 40.725, -73.998), ("10013", 40.720, -74.005),
    ("10014", 40.734, -74.006), ("10016", 40.745, -73.978), ("10017", 40.752, -73.972),
    ("10018", 40.755, -73.993), ("10019", 40.766, -73.987), ("10021", 40.769, -73.959),
    ("10022", 40.758, -73.968), ("10023", 40.776, -73.982), ("10024", 40.799, -73.972),
    ("10025", 40.799, -73.968), ("10026", 40.803, -73.953), ("10027", 40.811, -73.953),
    ("10028", 40.776, -73.953), ("10029", 40.792, -73.944), ("10030", 40.818, -73.943),
    ("10031", 40.825, -73.950), ("10032", 40.838, -73.942), ("10033", 40.851, -73.934),
    ("10034", 40.867, -73.921), ("10035", 40.795, -73.929), ("10036", 40.759, -73.990),
    ("10037", 40.813, -73.937), ("10038", 40.709, -74.003), ("10039", 40.827, -73.936),
    ("10040", 40.858, -73.929), ("10044", 40.762, -73.950), ("10065", 40.765, -73.963),
    ("10075", 40.773, -73.956), ("10128", 40.781, -73.950), ("10280", 40.711, -74.016),
]


def main() -> None:
    db = SessionLocal()
    try:
        for zip_code, lat, lng in MANHATTAN_ZIPS:
            row = db.get(ZipCentroid, zip_code)
            if row is None:
                db.add(ZipCentroid(zip_code=zip_code, latitude=lat, longitude=lng, borough="Manhattan"))
            else:
                row.latitude, row.longitude, row.borough = lat, lng, "Manhattan"
        db.commit()
        print(f"Seeded {len(MANHATTAN_ZIPS)} Manhattan ZIP centroids.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
