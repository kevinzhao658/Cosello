CATEGORY_SCHEMAS = {
    "clothing": {
        "label": "Clothing & Accessories",
        "fields": [
            {"key": "brand", "label": "Brand", "type": "text", "required": True},
            {"key": "size", "label": "Size", "type": "text", "required": True},
            {"key": "gender", "label": "Gender", "type": "select", "required": True,
             "options": ["Men's", "Women's", "Unisex", "Kids"]},
            {"key": "style_code", "label": "Style Code", "type": "text", "required": False,
             "tooltip": "Found on the interior care label or hang tag (e.g. Nike CU7982-010). Providing this lets us match your item to the exact product for accurate pricing and details."},
        ],
    },
    "furniture": {
        "label": "Furniture & Home",
        "fields": [
            {"key": "brand", "label": "Brand", "type": "text", "required": True},
            {"key": "model", "label": "Model", "type": "text", "required": True},
            {"key": "carry_difficulty", "label": "Carry Difficulty", "type": "select", "required": True,
             "options": ["One person", "Two people", "Requires truck or movers"],
             "tooltip": "How many people are needed to safely move this item? Helps buyers plan their pickup."},
            {"key": "dimensions", "label": "Dimensions", "type": "text", "required": False,
             "tooltip": "Auto-filled when we identify the product. Override if needed."},
        ],
    },
    "electronics": {
        "label": "Electronics",
        "fields": [
            {"key": "brand", "label": "Brand", "type": "text", "required": True},
            {"key": "model", "label": "Model", "type": "text", "required": True},
        ],
    },
    "sports": {
        "label": "Sports & Outdoors",
        "fields": [
            {"key": "brand", "label": "Brand", "type": "text", "required": True},
            {"key": "model", "label": "Model", "type": "text", "required": True},
            {"key": "size", "label": "Size", "type": "text", "required": False},
        ],
    },
    "collectibles": {
        "label": "Collectibles & Art",
        "fields": [
            {"key": "brand_or_creator", "label": "Brand / Creator", "type": "text", "required": True},
            {"key": "year", "label": "Year / Era", "type": "text", "required": False},
        ],
    },
    "other": {
        "label": "Other",
        "fields": [],
    },
}
