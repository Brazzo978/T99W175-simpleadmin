/**
 * Band Selection Checkbox Generator
 *
 * Dynamically generates band selection checkboxes based on network mode (LTE/NSA/SA).
 * Handles cell locking state and applies appropriate layout classes.
 *
 * @module populate-checkbox
 */

/**
 * Populates the band selection form with checkboxes based on available bands.
 *
 * @param {string} lte_band - Colon-separated list of available LTE bands (e.g., "1:3:7:20")
 * @param {string} nsa_nr5g_band - Colon-separated list of available NSA 5G bands
 * @param {string} nr5g_band - Colon-separated list of available SA 5G bands
 * @param {string} locked_lte_bands - Colon-separated list of currently locked LTE bands
 * @param {string} locked_nsa_bands - Colon-separated list of currently locked NSA bands
 * @param {string} locked_sa_bands - Colon-separated list of currently locked SA bands
 * @param {Function|null} cellLock - Optional callback function for checkbox listeners
 *
 * Generates checkboxes for bands matching the currently selected network mode.
 * Checkboxes are pre-checked if the corresponding band is locked.
 * Layout adapts based on network mode (LTE vs NR/5G).
 */
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

  const dropdown = document.getElementById("networkModeBand");
  const mode = dropdown ? dropdown.value : "LTE";

  // Exit if form container doesn't exist
  if (!checkboxesForm) return;

  // Apply layout class based on network mode
  checkboxesForm.classList.remove("lte-layout", "nr-layout");
  if (mode === "LTE") {
    checkboxesForm.classList.add("lte-layout");
  } else {
    checkboxesForm.classList.add("nr-layout");
  }

  // Validate required elements
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

  /**
   * Safely splits a colon-separated string into an array.
   * Trims whitespace and filters out empty strings.
   *
   * @param {string} value - The colon-separated string to split
   * @returns {string[]} Array of non-empty trimmed strings
   */
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

  // Parse locked bands into arrays
  var locked_lte_bands_array = safeSplit(locked_lte_bands);
  var locked_nsa_bands_array = safeSplit(locked_nsa_bands);
  var locked_sa_bands_array = safeSplit(locked_sa_bands);

  /**
   * Checks if a band is currently locked in the selected mode.
   *
   * @param {string} band - The band identifier to check
   * @returns {boolean} True if the band is locked, false otherwise
   */
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

  // Generate checkboxes if bands are available
  if (typeof bands === "string" && bands.length > 0 && bands !== "0") {
    var bandsArray = safeSplit(bands);

    var container = document.createElement("div");
    container.className = "band-toggle-container";

    // Create checkbox for each band
    bandsArray.forEach(function (band) {
      var toggleDiv = document.createElement("div");
      toggleDiv.className = "band-toggle";

      var checkboxInput = document.createElement("input");
      checkboxInput.type = "checkbox";
      checkboxInput.id = "inlineCheckbox" + band;
      checkboxInput.value = band;
      checkboxInput.autocomplete = "off";
      checkboxInput.checked = isBandLocked(band);

      var label = document.createElement("label");
      label.className = "band-toggle-label";
      label.htmlFor = "inlineCheckbox" + band;
      label.textContent = prefix + band;

      toggleDiv.appendChild(checkboxInput);
      toggleDiv.appendChild(label);
      container.appendChild(toggleDiv);
    });

    checkboxesForm.appendChild(container);
  } else {
    // Display message when no bands are available
    var noBandsText = document.createElement("p");
    noBandsText.className = "text-center";
    noBandsText.innerText = "No supported bands available";
    checkboxesForm.appendChild(noBandsText);
  }

  // Attach checkbox listeners if cell lock callback is provided
  if (cellLock && typeof addCheckboxListeners === "function") {
    addCheckboxListeners(cellLock);
  }
}
