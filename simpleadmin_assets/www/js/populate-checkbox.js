function populateCheckboxes(
  lte_band,
  nsa_nr5g_band,
  nr5g_band,
  locked_lte_bands,
  locked_nsa_bands,
  locked_sa_bands,
  cellLock
) {
  var checkboxesForm = document.getElementById("checkboxForm");
  var networkModeElement = document.getElementById("networkModeBand");

  if (!checkboxesForm || !networkModeElement) {
    console.warn(
      "Unable to populate the checkboxes: required elements are missing."
    );
    return;
  }

  var selectedMode = networkModeElement.value;
  var bands;
  var prefix;

  // Determine bands and prefix based on selected network mode
  if (selectedMode === "LTE") {
    bands = lte_band;
    prefix = "B";
  } else if (selectedMode === "NSA") {
    bands = nsa_nr5g_band;
    prefix = "N";
  } else if (selectedMode === "SA") {
    bands = nr5g_band;
    prefix = "N";
  }

  checkboxesForm.innerHTML = ""; // Clear existing checkboxes

  var safeSplit = function (value) {
    if (typeof value !== "string" || value.length === 0) {
      return [];
    }

    return value
      .split(":")
      .map(function (item) {
        return item.trim();
      })
      .filter(function (item) {
        return item.length > 0;
      });
  };

  // Store the locked bands in arrays
  var locked_lte_bands_array = safeSplit(locked_lte_bands);
  var locked_nsa_bands_array = safeSplit(locked_nsa_bands);
  var locked_sa_bands_array = safeSplit(locked_sa_bands);

  var isBandLocked = function(band) {
    if (selectedMode === "LTE" && locked_lte_bands_array.includes(band)) {
      return true;
    }
    if (selectedMode === "NSA" && locked_nsa_bands_array.includes(band)) {
      return true;
    }
    if (selectedMode === "SA" && locked_sa_bands_array.includes(band)) {
      return true;
    }
    return false;
  };

  var fragment = document.createDocumentFragment();

  if (typeof bands === "string" && bands.length > 0 && bands !== "0") {
    var bandsArray = safeSplit(bands);
    var currentRow;

    bandsArray.forEach(function (band, index) {
      if (index % 5 === 0) {
        currentRow = document.createElement("div");
        currentRow.className = "row mb-2 mx-auto"; // Add margin bottom for spacing
        fragment.appendChild(currentRow);
      }

      var checkboxDiv = document.createElement("div");
      checkboxDiv.className = "form-check form-check-reverse col-2"; // Each checkbox takes a column
      var checkboxInput = document.createElement("input");
      checkboxInput.className = "form-check-input";
      checkboxInput.type = "checkbox";
      checkboxInput.id = "inlineCheckbox" + band;
      checkboxInput.value = band;
      checkboxInput.autocomplete = "off";
      checkboxInput.checked = isBandLocked(band);

      var checkboxLabel = document.createElement("label");
      checkboxLabel.className = "form-check-label";
      checkboxLabel.htmlFor = "inlineCheckbox" + band;
      checkboxLabel.innerText = prefix + band;

      checkboxDiv.appendChild(checkboxInput);
      checkboxDiv.appendChild(checkboxLabel);
      currentRow.appendChild(checkboxDiv);
    });
  } else {
    // Create a text saying that no bands are available
    var noBandsText = document.createElement("p");
    noBandsText.className = "text-center";
    noBandsText.innerText = "No supported bands available";
    fragment.appendChild(noBandsText);
  }

  checkboxesForm.appendChild(fragment);
  if (cellLock && typeof addCheckboxListeners === "function") {
    addCheckboxListeners(cellLock);
  }
}
