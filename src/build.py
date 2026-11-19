import json, pathlib
here = pathlib.Path(__file__).parent
out = here.parent / "index.html"
seed = json.loads((here / "seed.json").read_text())
now = 1763337600000
demo = {
    "names": {"demo-teacher": "You", "demo-s1": "Amara Okafor", "demo-s2": "Luis Herrera", "demo-s3": "Mei Chen"},
    "docs": {
        "members/demo-s1": {"classIds": {"fr-a1": now}},
        "members/demo-s2": {"classIds": {"fr-a1": now + 1}},
        "members/demo-s3": {"classIds": {"fr-a1": now + 2}},
        "subs/demo-s1": {"items": {
            "a-quiz1": {"answers": [1, 2, 1, 0, 0], "right": 4, "total": 5, "grade": 4, "submittedAt": now, "gradedAt": now, "feedback": ""},
            "a-write1": {"text": "Je m'appelle Amara. J'habite à Toronto. Je suis étudiante à l'université. Je parle anglais, igbo et un peu français.", "submittedAt": now}}},
        "subs/demo-s3": {"items": {
            "a-quiz1": {"answers": [1, 2, 1, 0, 2], "right": 5, "total": 5, "grade": 5, "submittedAt": now, "gradedAt": now, "feedback": ""}}},
        "prog/demo-s1": {"cards": {f"d-greet~c{i}": {"b": 4, "d": now + 8 * 86400000, "n": 4} for i in range(1, 8)}, "updated": now},
        "prog/demo-s3": {"cards": {f"d-greet~c{i}": {"b": 2, "d": now + 2 * 86400000, "n": 2} for i in range(1, 4)}, "updated": now},
        "threads/demo-s1": {"msgs": {"m1": {"from": "demo-s1", "text": "Bonjour ! Is Monday's class online or in person?", "at": now}}, "lastAt": now},
        "bookings/demo-s2": {"slots": {"e-oh1": True}},
        "vocab/demo-teacher": {"langs": {"fr": {"at": now, "name": "French"}, "es": {"at": now + 1, "name": "Spanish"}}, "words": {
            "w1": {"lang": "fr", "term": "la boulangerie", "meaning": "bakery", "example": "Je vais à la boulangerie tous les matins.", "note": "feminine", "at": now, "star": True},
            "w2": {"lang": "fr", "term": "dépanneur", "meaning": "convenience store (Québec)", "note": "Québécois", "at": now + 1},
            "w3": {"lang": "fr", "term": "magasiner", "meaning": "to go shopping (Québec)", "at": now + 2},
            "w4": {"lang": "es", "term": "la madrugada", "meaning": "the early hours of the morning", "at": now + 3}}},
    },
}
html = (here / "template.html").read_text()
html = html.replace("__SEED__", json.dumps(seed, ensure_ascii=False)).replace("__DEMO__", json.dumps(demo, ensure_ascii=False))
out.write_text(html)
print(len(html))
