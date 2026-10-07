/**
 * Global Reboot Utility
 *
 * Provides reboot functionality that can be called from anywhere in the application.
 * Handles reboot confirmation modal and countdown display.
 *
 * @module reboot-utils
 * @requires atcommand-utils.js
 */

(function (global) {
  let rebootModal = null;
  let rebootCountdownModal = null;
  let countdownInterval = null;
  let countdown = 40;

  /**
   * Shows the reboot confirmation modal.
   */
  function showRebootModal() {
    if (rebootModal) {
      rebootModal.style.display = 'flex';
    }
  }

  /**
   * Hides the reboot confirmation modal.
   */
  function hideRebootModal() {
    if (rebootModal) {
      rebootModal.style.display = 'none';
    }
  }

  /**
   * Shows the reboot countdown modal.
   */
  function showRebootCountdown() {
    if (rebootCountdownModal) {
      rebootCountdownModal.style.display = 'flex';
    }
  }

  /**
   * Hides the reboot countdown modal.
   */
  function hideRebootCountdown() {
    if (rebootCountdownModal) {
      rebootCountdownModal.style.display = 'none';
    }
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  /**
   * Updates the countdown display.
   */
  function updateCountdown() {
    const countdownElement = document.getElementById('rebootCountdown');
    if (countdownElement) {
      countdownElement.textContent = countdown;
    }
  }

  /**
   * Performs the reboot operation.
   * Sends AT+CFUN=1,1 command to reboot the device.
   */
  async function performReboot() {
    hideRebootModal();
    showRebootCountdown();
    countdown = 40;
    updateCountdown();

    try {
      // Use ATCommandService if available, otherwise use fetch
      if (typeof ATCommandService !== 'undefined') {
        const result = await ATCommandService.execute('AT+CFUN=1,1', {
          retries: 0,
          timeout: 20000,
        });

        if (!result.ok) {
          hideRebootCountdown();
          alert('Reboot failed: ' + (result.error?.message || 'Unknown error'));
          return;
        }
      } else {
        // Fallback to direct fetch
        const response = await fetch('/cgi-bin/get_atcommand?atcmd=' + encodeURIComponent('AT+CFUN=1,1'));
        if (!response.ok) {
          hideRebootCountdown();
          alert('Reboot failed: HTTP ' + response.status);
          return;
        }
      }

      // Start countdown
      countdownInterval = setInterval(() => {
        countdown--;
        updateCountdown();
        if (countdown <= 0) {
          clearInterval(countdownInterval);
          countdownInterval = null;
          // Reload page after countdown
          window.location.reload();
        }
      }, 1000);
    } catch (error) {
      hideRebootCountdown();
      console.error('Reboot error:', error);
      alert('Reboot failed: ' + error.message);
    }
  }

  /**
   * Initializes the reboot utility.
   * Sets up modal references and event listeners.
   */
  function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    rebootModal = document.getElementById('globalRebootModal');
    rebootCountdownModal = document.getElementById('globalRebootCountdownModal');

    // Set up event listeners for reboot buttons
    const rebootButtons = document.querySelectorAll('[data-reboot-action]');
    rebootButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        showRebootModal();
      });
    });

    // Set up confirm button
    const confirmButton = document.getElementById('globalRebootConfirm');
    if (confirmButton) {
      confirmButton.addEventListener('click', performReboot);
    }

    // Set up cancel button
    const cancelButton = document.getElementById('globalRebootCancel');
    if (cancelButton) {
      cancelButton.addEventListener('click', hideRebootModal);
    }
  }

  // Initialize when script loads
  init();

  // Export to global scope
  global.RebootUtils = {
    showRebootModal,
    hideRebootModal,
    performReboot,
  };
})(window);
