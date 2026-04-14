from services.google.vision import VisionResult


def build_evidence_block(results: list[VisionResult]) -> str:
    if not results:
        return ""

    best_guesses = []
    entity_scores: dict[str, float] = {}
    all_titles: list[str] = []
    seen_titles: set[str] = set()
    ocr_parts: list[str] = []

    for r in results:
        for label in r.best_guess_labels:
            if label not in best_guesses:
                best_guesses.append(label)

        for desc, score in r.web_entities:
            if desc in entity_scores:
                entity_scores[desc] = max(entity_scores[desc], score)
            else:
                entity_scores[desc] = score

        for title in r.matching_page_titles:
            if title not in seen_titles:
                seen_titles.add(title)
                all_titles.append(title)

        if r.ocr_text:
            ocr_parts.append(r.ocr_text)

    ranked_entities = sorted(entity_scores.items(), key=lambda x: x[1], reverse=True)

    if not best_guesses and not ranked_entities and not all_titles:
        return ""

    lines = ["RETRIEVAL EVIDENCE (treat as ground truth unless the photo clearly contradicts):"]

    if best_guesses:
        lines.append(f"Best guess: {best_guesses[0]}")

    if ranked_entities:
        entity_strs = [f"{name} ({score:.2f})" for name, score in ranked_entities[:10]]
        lines.append(f"Likely product entities (ranked): {', '.join(entity_strs)}")

    if all_titles:
        lines.append(f"Page titles where this image appears: {'; '.join(all_titles[:5])}")

    label_scores: dict[str, float] = {}
    for r in results:
        for desc, score in getattr(r, "labels", []):
            if desc not in label_scores:
                label_scores[desc] = score
            else:
                label_scores[desc] = max(label_scores[desc], score)
    if label_scores:
        ranked_labels = sorted(label_scores.items(), key=lambda x: x[1], reverse=True)
        label_strs = [name for name, _ in ranked_labels[:8]]
        lines.append(f"Visual labels: {', '.join(label_strs)}")

    if ocr_parts:
        combined_ocr = " | ".join(ocr_parts)
        if len(combined_ocr) > 300:
            combined_ocr = combined_ocr[:300] + "..."
        lines.append(f"OCR text extracted from photo: {combined_ocr}")

    block = "\n".join(lines)
    # ~500 token cap (rough: 1 token ≈ 4 chars)
    if len(block) > 2000:
        block = block[:2000] + "\n..."
    return block
