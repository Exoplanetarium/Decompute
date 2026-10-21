import hashlib
import json
import os

from rdkit import Chem
from rdkit.Chem import AllChem
from meeko import MoleculePreparation, PDBQTWriterLegacy
from vina import Vina

v = Vina(sf_name="vina", seed=42, verbosity=0, cpu=4)
TARGET_DIR = os.environ.get("DECOMPUTE_TARGET_DIR", "/opt/target")
v.set_receptor(os.path.join(TARGET_DIR, "receptor.pdbqt"))
with open(os.path.join(TARGET_DIR, "receptor.box.txt"), 'r') as file:
    lines = file.readlines()
    center = [float(lines[0].split("=")[1]), float(lines[1].split("=")[1]), float(lines[2].split("=")[1])]
    box_size = [float(lines[3].split("=")[1]), float(lines[4].split("=")[1]), float(lines[5].split("=")[1])]
v.compute_vina_maps(center=center, box_size=box_size)

def prep_ligand(smiles):
    smiles_mol = Chem.MolFromSmiles(smiles)
    if smiles_mol == None:
        raise ValueError("Chem.MolFromSmiles failed")
    ligand = Chem.AddHs(smiles_mol)
    check = AllChem.EmbedMolecule(ligand, randomSeed=42)
    if check != 0:
        raise ValueError("AllChem.EmbedMolecule failed")
    AllChem.MMFFOptimizeMolecule(ligand)
    bonds = MoleculePreparation().prepare(ligand)
    pdbqt_writer = PDBQTWriterLegacy()
    pdbqt_string = pdbqt_writer.write_string(bonds[0])
    if not pdbqt_string[1]:
        raise ValueError("Prep failed")
    return pdbqt_string[0]

def dock(pdbqt):
    v.set_ligand_from_string(pdbqt)
    v.dock(exhaustiveness=8, n_poses=9)
    return v.energies(n_poses=1), v.poses(n_poses=1)

if __name__ == "__main__":
    INPUT_DIR = os.environ.get("DECOMPUTE_INPUT_DIR", "/input")
    smiles_list = []
    for file_name in sorted(os.listdir(INPUT_DIR)):
        with open (os.path.join(INPUT_DIR, file_name), encoding="utf-8") as file:
            smiles_list.extend([line.strip() for line in file if line.strip() and not line.startswith("#")])
    items = []
    total = len(smiles_list)
    for index, smiles_line in enumerate(smiles_list):
        parts = smiles_line.split(maxsplit=1)
        smiles = parts[0]
        name = parts[1] if len(parts) > 1 else None
        item = {"index" : index, "name": name, "smiles": smiles, "smilesHash": hashlib.sha256(smiles.encode()).hexdigest()}
        try:
            pdbqt_string = prep_ligand(smiles)
            energies, poses = dock(pdbqt_string)
            item["score"] = round(float(energies[0][0]), 3)
            item["pose"] = poses
        except Exception as e:
            item["error"] = str(e)    
        items.append(item)
        label = name or smiles
        result_text = item["score"] if "score" in item else f"failed ({item['error']})"
        print(f"[{index + 1}/{total}] {label}: {result_text}", flush=True)
    result = {
        "schemaVersion": 1,
        "kind": "docking",
        "target": "AChE-4EY7",
        "engine": "vina-1.2.7", "exhaustiveness": 8, "seed": 42,
        "items": items
    }
    
    output_dir = os.environ.get("DECOMPUTE_OUTPUT_DIR", "/output")
    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(output_dir, "result.json"), "w", encoding="utf-8") as out:
        json.dump(result, out, separators=(",", ":"))
        
            