function describePrefNetworkValue(value) {
  const labels = {
    0: "Auto",
    1: "3G Only",
    2: "4G / LTE Only",
    3: "3G + 4G / LTE",
    4: "5G Only",
    5: "3G + 5G",
    6: "4G / LTE + 5G",
    7: "3G + 4G / LTE + 5G",
  };

  if (!Number.isInteger(value) || value < 0) {
    return "Unknown";
  }

  return labels[value] || "Unknown";
}

function parseCurrentSettings(rawdata) {
  const lines = rawdata
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  console.log(lines);

  let sim = "-";
  const simLine = lines.find(
    (line) => line.includes("SIM1 ENABLE") || line.includes("SIM2 ENABLE")
  );
  if (simLine) {
    sim = simLine.split(" ")[0].replace(/\D/g, "");
  }

  const findFirstProfileLine = (entries, prefix) => {
    const normalizedPrefix = `+${prefix.toUpperCase()}`;
    const primaryLine = entries.find((line) =>
      line.trim().toUpperCase().startsWith(`${normalizedPrefix}: 1`)
    );

    if (primaryLine) {
      return primaryLine;
    }

    return entries.find((line) =>
      line.trim().toUpperCase().startsWith(`${normalizedPrefix}:`)
    );
  };

  let apn = "Failed fetching APN";
  const apnLine = findFirstProfileLine(lines, "CGCONTRDP");
  if (apnLine) {
    const parts = apnLine.split(",");
    if (parts.length >= 3) {
      apn = parts[2].replace(/\"/g, "").trim();
    }
  }

  let apnIP = "-";
  const apnIpLine = findFirstProfileLine(lines, "CGDCONT");
  if (apnIpLine) {
    const parts = apnIpLine.split(",");
    if (parts.length >= 2) {
      apnIP = parts[1].replace(/\"/g, "").trim();
    }
  }

  const extractPayload = (line) => {
    if (!line || !line.includes(":")) {
      return "";
    }

    return line.split(":").slice(1).join(":").trim();
  };

  const parseLteLocks = (line) => {
    const payload = extractPayload(line);

    if (!payload || /have not set cell lock before/i.test(payload)) {
      return [];
    }

    const matches = [...payload.matchAll(/\((\d+),(\d+)\)/g)];
    const parsedPairs = matches
      .map((match) => ({
        pci: Number.parseInt(match[1], 10),
        earfcn: Number.parseInt(match[2], 10),
      }))
      .filter(
        (pair) =>
          Number.isInteger(pair.pci) && Number.isInteger(pair.earfcn)
      );

    if (parsedPairs.length > 0) {
      return parsedPairs;
    }

    const numbers = payload
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value));

    const pairs = [];

    for (let i = 0; i + 1 < numbers.length; i += 2) {
      pairs.push({ pci: numbers[i], earfcn: numbers[i + 1] });
    }

    return pairs;
  };

  const parseNrLocks = (line) => {
    const payload = extractPayload(line);

    if (!payload || /have not set cell lock before/i.test(payload)) {
      return [];
    }

    const matches = [...payload.matchAll(/\((\d+),(\d+),(\d+),(\d+)\)/g)];
    const parsedLocks = matches
      .map((match) => ({
        band: Number.parseInt(match[1], 10),
        scs: Number.parseInt(match[2], 10),
        arfcn: Number.parseInt(match[3], 10),
        pci: Number.parseInt(match[4], 10),
      }))
      .filter(
        (lock) =>
          Number.isInteger(lock.band) &&
          Number.isInteger(lock.scs) &&
          Number.isInteger(lock.arfcn) &&
          Number.isInteger(lock.pci)
      );

    if (parsedLocks.length > 0) {
      return parsedLocks;
    }

    const numbers = payload
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value));

    const locks = [];

    for (let i = 0; i + 3 < numbers.length; i += 4) {
      locks.push({
        band: numbers[i],
        scs: numbers[i + 1],
        arfcn: numbers[i + 2],
        pci: numbers[i + 3],
      });
    }

    return locks;
  };

  const describeScs = (value) => {
    const labels = {
      0: "15kHz",
      1: "30kHz",
      2: "60kHz",
      3: "120kHz",
      4: "240kHz",
    };

    return labels[value] || `SCS ${value}`;
  };

  const lteLocks = parseLteLocks(
    lines.find((line) => /LTE_LOCK:/i.test(line)) || ""
  );

  const nrLocks = parseNrLocks(
    lines.find((line) => /NR5G_LOCK:/i.test(line)) || ""
  );

  const describeLteLock = (locks) => {
    if (!Array.isArray(locks) || locks.length === 0) {
      return null;
    }

    const formatted = locks
      .map((pair) => `PCI ${pair.pci} / EARFCN ${pair.earfcn}`)
      .join(" · ");

    return `LTE (${locks.length}): ${formatted}`;
  };

  const describeNrLock = (locks) => {
    if (!Array.isArray(locks) || locks.length === 0) {
      return null;
    }

    const formatted = locks
      .map(
        (lock) =>
          `Band ${lock.band} (${describeScs(lock.scs)}) / PCI ${lock.pci} / NR-ARFCN ${lock.arfcn}`
      )
      .join(" · ");

    return `NR5G-SA (${locks.length}): ${formatted}`;
  };

  const statusParts = [describeLteLock(lteLocks), describeNrLock(nrLocks)].filter(
    Boolean
  );

  const cellLockStatus =
    statusParts.length > 0 ? statusParts.join(" | ") : "Not Locked";

  let prefNetwork = "-";
  let prefNetworkValue = null;
  const prefNetworkLine = lines.find((line) => line.includes("^SLMODE:"));
  if (prefNetworkLine) {
    const parsedValue = Number.parseInt(
      prefNetworkLine
      .split(":")[1]
      .split(",")[1]
      .replace(/\"/g, "")
      .trim(),
      10
    );

    if (!Number.isNaN(parsedValue)) {
      prefNetworkValue = parsedValue;
      prefNetwork = describePrefNetworkValue(parsedValue);
    }
  }

  let nr5gModeValue = null;
  const nr5gModeLine = lines.find((line) => line.includes("^NR5G_MODE:"));
  if (nr5gModeLine) {
    const parsedValue = Number.parseInt(
      nr5gModeLine.split(":")[1].replace(/\"/g, "").trim(),
      10
    );

    if (!Number.isNaN(parsedValue)) {
      nr5gModeValue = parsedValue;
    }
  }

  let bands = "Failed fetching bands";
  const pccLine = lines.find((line) => line.includes("PCC info:"));
  if (pccLine) {
    const pccBands = pccLine.split(":")[1].split("_")[1].replace(/\D/g, "");

    const sccBands = lines
      .filter((line) => line.includes("SCC"))
      .map((line) => line.split(":")[1].split("_")[1].replace(/\D/g, ""))
      .filter((value) => value.length > 0)
      .join(", ");

    bands = sccBands ? `${pccBands}, ${sccBands}` : pccBands;
  }

  return {
    sim,
    apn,
    apnIP,
    cellLockStatus,
    prefNetwork,
    prefNetworkValue,
    bands,
    nr5gModeValue,
  };
}

function describeNr5gMode(value) {
  const labels = {
    0: "Auto",
    1: "NSA",
    2: "SA",
  };

  if (!Number.isInteger(value) || value < 0) {
    return "Unknown";
  }

  return labels[value] || "Unknown";
}
