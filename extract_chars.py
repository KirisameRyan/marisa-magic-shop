import json, os
with open(r"D:\Marisa_Project\data\waifu-db-zh.json", "r", encoding="utf-8-sig") as f:
    data = json.load(f)
out_path = r"D:\Marisa_Project\data\chars_270_359.txt"
with open(out_path, "w", encoding="utf-8") as out:
    for i in range(270, min(360, len(data))):
        c = data[i]
        did = c["id"]
        name = c["name"]
        native = c["name_native"]
        desc = c.get("description", "").replace("\n", " ")
        out.write("INDEX %d: [%d] %s\n" % (i, did, name))
        out.write("  Native: %s\n" % native)
        out.write("  Desc: %s\n\n" % (desc[:800],))
print("Done writing to " + out_path)
