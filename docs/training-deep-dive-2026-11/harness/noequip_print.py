"""Lays out the No equipment print (Pgm9) from the JSON that
`zzNoEquipmentPrint.scratch.test.ts.txt` writes: each day, its lifts in
order, sets and reps, and the app's minutes, today beside new.

Usage: python3 noequip_print.py main.json new.json SECTION
SECTION is general, beginner, strength, minimal, beginner_home or floor.
"""
import json
import sys

SPLITS = {
    "full_body": "full body",
    "upper_lower": "upper / lower",
    "upper_lower_fb": "upper / lower + full body",
    "ppl_ul": "push / pull / legs + upper / lower",
    "ppl_x2": "push / pull / legs twice",
}


def key(r):
    return (r["equipment"], r["goal"], r["level"], r["minutes"], r["days"], r["pullUpBar"])


def reps(l):
    unit = " s" if l["unit"] == "seconds" else ""
    top = f'-{l["top"]}' if l["top"] else ""
    return f'{l["sets"]}x{l["reps"]}{top}{unit}'


def lift(l):
    return f'{l["name"]} {reps(l)}' + ("\\*" if l["main"] else "")


def week(r):
    return sum(sum(l["sets"] for l in d["lifts"]) for d in r["workouts"])


def table(sections):
    out = [
        "|       | Day | Lifts | Sets | Min | Prescription |",
        "| ----- | --- | ----- | ---- | --- | ------------ |",
    ]
    for label, r in sections:
        for d in r["workouts"]:
            sets = sum(l["sets"] for l in d["lifts"])
            out.append(
                f'| {label} | {d["dayName"]} | {len(d["lifts"])} | {sets} | {d["minutes"]} | '
                + ", ".join(lift(l) for l in d["lifts"])
                + " |"
            )
    return out


def main(main_path, new_path, section):
    today = {key(r): r for r in json.load(open(main_path))}
    new = {key(r): r for r in json.load(open(new_path))}
    out = []

    def setup(title, goal, level, minutes, days):
        t = today[("minimal", goal, level, minutes, days, None)]
        off = new[("no_equipment", goal, level, minutes, days, False)]
        bar = new[("no_equipment", goal, level, minutes, days, True)]
        out.extend([f"### {title}", ""])
        out.append(
            f"Today: {SPLITS[t['splitType']]}, {week(t)} sets a week. "
            f"No bar: {SPLITS[off['splitType']]}, {week(off)} sets. "
            f"Bar: {SPLITS[bar['splitType']]}, {week(bar)} sets."
        )
        out.extend([""] + table([("Today", t), ("No bar", off), ("Bar", bar)]) + [""])

    def change(title, equipment, goal, level, minutes, days, bar):
        out.extend([f"### {title}", ""])
        out.extend(
            table(
                [
                    ("Today", today[(equipment, goal, level, minutes, days, None)]),
                    ("New", new[(equipment, goal, level, minutes, days, bar)]),
                ]
            )
            + [""]
        )

    if section == "general":
        for d in [2, 3, 4, 5, 6]:
            setup(f"{d} days", "general", "intermediate", 45, d)
    elif section == "beginner":
        for d in [3, 6]:
            setup(f"Beginner, {d} days", "general", "beginner", 45, d)
    elif section == "strength":
        setup("Get stronger, 4 days, 60 min", "strength", "intermediate", 60, 4)
        setup("Build muscle, 4 days, 60 min", "hypertrophy", "intermediate", 60, 4)
    elif section == "minimal":
        change("Minimal, 4 days, no bar", "minimal", "general", "intermediate", 45, 4, False)
        change("Minimal, 6 days, no bar", "minimal", "general", "intermediate", 45, 6, False)
    elif section == "beginner_home":
        change(
            "Minimal or Home gym, beginner, 3 days, with the bar or never asked",
            "minimal", "general", "beginner", 45, 3, None,
        )
    elif section == "floor":
        change(
            "Home gym, Get stronger, 4 days, 60 min, with the bar",
            "home_gym", "strength", "intermediate", 60, 4, True,
        )
    print("\n".join(out))


if __name__ == "__main__":
    main(*sys.argv[1:4])
