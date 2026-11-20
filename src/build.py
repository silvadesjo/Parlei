"""Builds public/index.html from src/app.html, inserting the sample class (seed.json) and the demo data."""
import json, pathlib
here = pathlib.Path(__file__).parent
seed = json.loads((here / "seed.json").read_text())
now = 1763337600000
demo = {
    "names": {"demo-teacher": "You", "demo-s1": "Amara Okafor", "demo-s2": "Luis Herrera", "demo-s3": "Mei Chen"},
    "docs": {
        "members/demo-s1": {"classIds": {"fr-a1": now}},
        "members/demo-s2": {"classIds": {"fr-a1": now + 1}},
        "members/demo-s3": {"classIds": {"fr-a1": now + 2}},
        "subs/demo-s1": {"items": {
            "a-quiz1": {"answers": [1, 2, 1, 0, 0], "right": 4, "total": 5, "submittedAt": now},
            "a-write1": {"text": "Je m'appelle Amara. J'habite à Toronto. Je suis étudiante à l'université. Je parle anglais, igbo et un peu français.", "submittedAt": now}}},
        "subs/demo-s3": {"items": {
            "a-quiz1": {"answers": [1, 2, 1, 0, 2], "right": 5, "total": 5, "submittedAt": now}}},
        "prog/demo-s1": {"cards": {f"d-greet~c{i}": {"b": 4, "d": now + 8 * 86400000, "n": 4} for i in range(1, 8)}, "updated": now},
        "prog/demo-s3": {"cards": {f"d-greet~c{i}": {"b": 2, "d": now + 2 * 86400000, "n": 2} for i in range(1, 4)}, "updated": now},
        "convos/demo-s1__demo-teacher": {"student": "demo-s1", "participants": ["demo-s1", "demo-teacher"], "msgs": {"m1": {"from": "demo-s1", "text": "Bonjour ! Is Monday's class online or in person?", "at": now}}, "lastAt": now, "read": {}},
        "bookings/demo-s2": {"slots": {"e-oh1": True}},
        "profiles/demo-s1": {"first": "Amara", "last": "Okafor", "preferred": "", "email": "amara.okafor@example.com", "phone": "", "native": "English, Igbo", "goals": "Move to Montréal for my master's", "createdAt": now, "lastSeen": now},
        "profiles/demo-s2": {"first": "Luis", "last": "Herrera", "preferred": "Lucho", "email": "luis.h@example.com", "phone": "416-555-0142", "native": "Spanish, English", "goals": "", "createdAt": now + 1, "lastSeen": now},
        "vocab/demo-teacher": {"langs": {"fr": {"at": now, "name": "French"}, "es": {"at": now + 1, "name": "Spanish"}}, "words": {
            "w1": {"lang": "fr", "term": "la boulangerie", "meaning": "bakery", "example": "Je vais à la boulangerie tous les matins.", "note": "feminine", "at": now, "star": True},
            "w2": {"lang": "fr", "term": "dépanneur", "meaning": "convenience store (Québec)", "note": "Québécois", "at": now + 1},
            "w3": {"lang": "fr", "term": "magasiner", "meaning": "to go shopping (Québec)", "at": now + 2},
            "w4": {"lang": "es", "term": "la madrugada", "meaning": "the early hours of the morning", "at": now + 3}}},
    },
}
html = (here / "app.html").read_text()
html = html.replace("__SEED__", json.dumps(seed, ensure_ascii=False)).replace("__DEMO__", json.dumps(demo, ensure_ascii=False))
(here.parent / "public" / "index.html").write_text(html)
print("public/index.html", len(html), "bytes")
