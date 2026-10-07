/* Channel number to 3GPP band (same table as diag_bridge's copy). */
#ifndef COMMON_BANDS_H
#define COMMON_BANDS_H

#include <stdint.h>

/* NR-ARFCN -> NR band (TS 38.104), 0 if unknown. */
uint16_t nrarfcn_to_band(uint32_t arfcn);
/* EARFCN -> LTE band (TS 36.101), 0 if unknown. */
uint16_t earfcn_to_band(uint32_t earfcn);

#endif
