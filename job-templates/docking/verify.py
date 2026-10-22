import json
import os
import dock

INPUT_DIR = os.environ.get("DECOMPUTE_INPUT_DIR", "/input")
OUTPUT_DIR = os.environ.get("DECOMPUTE_OUTPUT_DIR", "/output")

def verify(item):
    check = True
    pose = item["pose"]
    temp = pose.splitlines()
    pose_fixed = ""
    for line in temp:
        if (not (line.startswith("MODEL") or line.startswith("ENDMDL"))):
            pose_fixed += line + "\n"

    dock.v.set_ligand_from_string(pose_fixed)
    rescore = dock.v.score()[0]
    if (abs(rescore - item["score"]) > 0.05):
        check = False
    else:
        for line in pose.splitlines():
            if (line.startswith("ATOM") or line.startswith("HETATM")):
                x = float(line[30:38])
                y = float(line[38:46])
                z = float(line[46:54])
                if (abs(x - (dock.center[0])) > dock.box_size[0] / 2):
                    check = False
                if (abs(y - (dock.center[1])) > dock.box_size[1] / 2):
                    check = False
                if (abs(z - (dock.center[2])) > dock.box_size[2] / 2):
                    check = False
    return item["index"], check, item["score"], round(rescore, 3)

if __name__ == "__main__":
    verify_entries = []
    with open(os.path.join(INPUT_DIR, "result copy.json"), "r") as file:
        items = json.load(file)["items"]
        for item in items:
            if "error" not in item:
                index, check, score, rescore = verify(item)
                entry = {"index": index, "ok": check, "reported": score, "rescored": rescore}
                verify_entries.append(entry)
    verify_json = {
        "items": verify_entries
    }

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(os.path.join(OUTPUT_DIR, "verify.json"), "w", encoding="utf-8") as out:
        json.dump(verify_json, out, separators=(",", ":"))
            