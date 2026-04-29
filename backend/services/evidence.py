from services.google.vision import VisionResult


def _format_single_image_evidence(idx: int, r: VisionResult) -> str | None:
    """Format one image's vision result as a labeled evidence section.

    Returns None if the result has no usable signal.
    """
    has_signal = (
        r.best_guess_labels
        or r.web_entities
        or r.matching_page_titles
        or r.labels
        or r.ocr_text
    )
    if not has_signal:
        return None

    parts: list[str] = [f"[Image {idx}]"]

    if r.best_guess_labels:
        parts.append(f"  Best guess: {r.best_guess_labels[0]}")

    if r.web_entities:
        ranked = sorted(r.web_entities, key=lambda x: x[1], reverse=True)[:6]
        entity_strs = [f"{name} ({score:.2f})" for name, score in ranked]
        parts.append(f"  Likely product entities (ranked): {', '.join(entity_strs)}")

    if r.matching_page_titles:
        parts.append(f"  Page titles where this image appears: {'; '.join(r.matching_page_titles[:3])}")

    if r.labels:
        ranked_labels = sorted(r.labels, key=lambda x: x[1], reverse=True)[:6]
        label_strs = [name for name, _ in ranked_labels]
        parts.append(f"  Visual labels: {', '.join(label_strs)}")

    if r.ocr_text:
        ocr = r.ocr_text
        if len(ocr) > 200:
            ocr = ocr[:200] + "..."
        parts.append(f"  OCR text: {ocr}")

    return "\n".join(parts)


def build_evidence_block(results: list[VisionResult]) -> str:
    """Build a per-image evidence block.

    Each image's vision signals are emitted under a `[Image N]` header so the
    consumer (Claude) can scope evidence to a specific image. Bulk uploads of
    multiple distinct products previously merged all signals into one pool,
    causing brand bleed across listings (e.g., Samsonite contaminating a
    Coach Duffel listing).
    """
    if not results:
        return ""

    sections: list[str] = []
    for idx, r in enumerate(results):
        section = _format_single_image_evidence(idx, r)
        if section is not None:
            sections.append(section)

    if not sections:
        return ""

    header = (
        "RETRIEVAL EVIDENCE PER IMAGE "
        "(each block is ground truth ONLY for the image with the matching index — "
        "do NOT mix brands, models, OCR, or entities across images):"
    )
    block = header + "\n\n" + "\n\n".join(sections)

    if len(block) > 4000:
        block = block[:4000] + "\n..."
    return block
