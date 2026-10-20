FROM condaforge/miniforge3:latest
# Pinned so every provider scores a molecule identically: the server's
# verification re-scores sampled poses and expects the same numbers back.
RUN mamba create -y -n dock -c conda-forge python=3.11 vina=1.2.7 meeko=0.8.0 rdkit=2026.03.1 \
 && mamba clean -afy
ENV PATH=/opt/conda/envs/dock/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1

# The agent runs this image with --network=none, so the prepared AChE
# receptor (PDB 4EY7, chain A) and its search box are baked in. chmod because
# the sandbox runs as a non-root uid that isn't the build user.
COPY receptor.pdbqt receptor.box.txt /opt/target/
COPY dock.py /app/
RUN chmod -R a+rX /opt/target /app

WORKDIR /app
ENTRYPOINT ["python", "dock.py"]
