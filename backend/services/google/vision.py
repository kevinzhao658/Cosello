import logging
from dataclasses import dataclass, field

from google.cloud import vision

from .client import get_client

logger = logging.getLogger(__name__)


@dataclass
class VisionResult:
    best_guess_labels: list[str] = field(default_factory=list)
    web_entities: list[tuple[str, float]] = field(default_factory=list)
    matching_page_titles: list[str] = field(default_factory=list)
    labels: list[tuple[str, float]] = field(default_factory=list)
    ocr_text: str = ""


def analyze_images(image_bytes_list: list[bytes]) -> list[VisionResult]:
    client = get_client()

    requests = []
    for img_bytes in image_bytes_list:
        image = vision.Image(content=img_bytes)
        features = [
            vision.Feature(type_=vision.Feature.Type.WEB_DETECTION, max_results=10),
            vision.Feature(type_=vision.Feature.Type.TEXT_DETECTION),
            vision.Feature(type_=vision.Feature.Type.LABEL_DETECTION, max_results=10),
            vision.Feature(type_=vision.Feature.Type.LOGO_DETECTION, max_results=5),
        ]
        requests.append(vision.AnnotateImageRequest(image=image, features=features))

    response = client.batch_annotate_images(requests=requests, timeout=10.0)

    results = []
    for resp in response.responses:
        result = VisionResult()

        if resp.web_detection:
            wd = resp.web_detection
            result.best_guess_labels = [
                label.label for label in (wd.best_guess_labels or []) if label.label
            ]
            result.web_entities = sorted(
                [
                    (e.description, e.score)
                    for e in (wd.web_entities or [])
                    if e.description and e.score >= 0.3
                ],
                key=lambda x: x[1],
                reverse=True,
            )
            seen_titles = set()
            for page in wd.pages_with_matching_images or []:
                if page.page_title and page.page_title not in seen_titles:
                    seen_titles.add(page.page_title)
                    if len(seen_titles) >= 5:
                        break
            result.matching_page_titles = list(seen_titles)

        if resp.label_annotations:
            result.labels = [
                (l.description, l.score)
                for l in resp.label_annotations
                if l.description and l.score >= 0.5
            ]

        logo_descriptions = [
            l.description for l in (resp.logo_annotations or [])
            if l.description and l.score >= 0.5
        ]
        if logo_descriptions:
            for logo in logo_descriptions:
                if not any(logo.lower() in e[0].lower() for e in result.web_entities):
                    result.web_entities.insert(0, (logo, 1.0))

        if resp.text_annotations:
            result.ocr_text = resp.text_annotations[0].description.strip().replace("\n", " ")

        results.append(result)

    return results
